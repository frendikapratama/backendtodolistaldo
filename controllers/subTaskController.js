import Subtask from "../models/Subtask.js";
import Task from "../models/Task.js";
import { handleError } from "../utils/errorHandler.js";
import User from "../models/User.js";
import { getWorkspaceFromSubtask } from "../utils/workspaceUtils.js";
import {
  validateInviteToken,
  generateInviteToken,
  createInviteObject,
} from "../utils/inviteUtils.js";
import { findOrCreateUser } from "../utils/userUtils.js";
import { sendSubtaskPicInvitationEmail } from "../utils/emailUtils.js";
import Workspace from "../models/Workspace.js";
import { createActivity } from "../helpers/activityhelper.js";
import { createSubtaskAssignmentNotification } from "../helpers/notificationHelper.js";
import { emitNotificationToUser } from "../sockets/socketHandler.js";

export async function getSubTask(req, res) {
  try {
    const data = await Subtask.find()
      .populate("task", "nama")
      .sort({ position: 1 });
    res.status(200).json(data);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createSubTask(req, res) {
  try {
    const { taskId } = req.params;
    const task = await Task.findById(taskId);
    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    const count = await Subtask.countDocuments({ task: taskId });
    const subtask = await Subtask.create({
      ...req.body,
      task: taskId,
      position: count,
    });
    await Task.findByIdAndUpdate(taskId, {
      $push: { subtask: subtask._id },
    });

    await createActivity({
      user: req.user._id,
      project: task.project,
      task: task._id,
      action: "CREATE_SUBTASK",
      description: `Membuat subtask "${subtask.nama}" pada task "${task.nama}"`,
      before: {},
      after: { nama: subtask.nama, task: taskId },
    });
    res.status(201).json({
      success: true,
      message: "subtask created successfully",
      data: subtask,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateSubTask(req, res) {
  try {
    const { subTaskId } = req.params;
    const { taskId, picEmail, ...updateData } = req.body;

    const oldSubTask = await Subtask.findById(subTaskId);
    if (!oldSubTask) {
      return res
        .status(404)
        .json({ success: false, message: "Subtask not found" });
    }

    if (picEmail) {
      const emails = Array.isArray(picEmail) ? picEmail : [picEmail];
      const io = req.app.get("io"); // Ambil io instance

      for (const email of emails) {
        const picResult = await handleSubtaskPicAssignment(
          subTaskId,
          email,
          oldSubTask,
          req.user._id
        );

        if (!picResult.success) {
          return res.status(picResult.status || 400).json(picResult);
        }

        // EMIT notifikasi jika PIC berhasil ditambahkan (bukan invited)
        if (picResult.notification && io) {
          emitNotificationToUser(io, picResult.notification.recipient, {
            _id: picResult.notification._id,
            type: picResult.notification.type,
            title: picResult.notification.title,
            message: picResult.notification.message,
            metadata: picResult.notification.metadata,
            task: picResult.notification.task,
            sender: picResult.notification.sender,
            isRead: false,
            createdAt: picResult.notification.createdAt,
          });

          console.log(
            `Sent subtask PIC assignment notification to user ${picResult.notification.recipient}`
          );
        }
      }

      const refreshedSubtask = await Subtask.findById(subTaskId);
      updateData.pic = refreshedSubtask.pic;
    }

    if (taskId && taskId !== String(oldSubTask.task)) {
      await Task.findByIdAndUpdate(oldSubTask.task, {
        $pull: { subtask: oldSubTask._id },
      });
      await Task.findByIdAndUpdate(taskId, {
        $push: { subtask: oldSubTask._id },
      });
      updateData.task = taskId;
    }

    const updatedSubTask = await Subtask.findByIdAndUpdate(
      subTaskId,
      updateData,
      { new: true }
    ).populate("pic", "username email");

    const before = {};
    const after = {};

    for (const key in updateData) {
      const oldValue = oldSubTask[key];
      const newValue = updateData[key];

      const oldStr = String(oldValue);
      const newStr = String(newValue);

      if (oldStr !== newStr) {
        before[key] = oldValue;
        after[key] = newValue;
      }
    }

    if (Object.keys(before).length > 0) {
      const workspaceResult = await getWorkspaceFromSubtask(subTaskId);

      if (workspaceResult.success) {
        const { workspace, project, task, group } = workspaceResult;

        await createActivity({
          user: req.user._id,
          workspace: workspace._id,
          project: project._id,
          group: group._id,
          task: task._id,
          action: "UPDATE_SUBTASK",
          description: `User mengupdate subtask ${updatedSubTask.nama}`,
          before,
          after,
        });
      }
    }

    res.status(200).json({
      success: true,
      message: "subtask updated successfully",
      data: updatedSubTask,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function handleSubtaskPicAssignment(
  subTaskId,
  picEmail,
  subtask,
  requesterId
) {
  try {
    const result = await getWorkspaceFromSubtask(subTaskId);
    if (!result.success) {
      return result;
    }

    const { workspace, project, task, group } = result;

    const targetUser = await User.findOne({ email: picEmail });
    const currentSubtask = await Subtask.findById(subTaskId);

    if (
      currentSubtask.pic &&
      currentSubtask.pic.some(
        (id) => targetUser && id.toString() === targetUser._id.toString()
      )
    ) {
      return {
        success: true,
        message: "User sudah menjadi PIC subtask ini",
      };
    }

    if (targetUser) {
      const isMember = workspace.members.some(
        (m) => m.user.toString() === targetUser._id.toString()
      );

      // Jika belum member, tambahkan ke workspace
      if (!isMember) {
        await Workspace.findByIdAndUpdate(workspace._id, {
          $push: {
            members: {
              user: targetUser._id,
              role: "member",
            },
          },
        });

        await User.findByIdAndUpdate(targetUser._id, {
          $push: {
            workspaces: {
              workspace: workspace._id,
              role: "member",
            },
          },
        });
      }

      // Tambahkan sebagai PIC
      await Subtask.findByIdAndUpdate(subTaskId, {
        $addToSet: { pic: targetUser._id },
      });

      await User.findByIdAndUpdate(targetUser._id, {
        $addToSet: { assignedSubtasks: subTaskId },
      });

      // TAMBAHAN: Buat notifikasi untuk PIC yang ditambahkan
      try {
        const requester = await User.findById(requesterId);

        const notification = await createSubtaskAssignmentNotification({
          subtaskId: currentSubtask._id,
          subtaskName: currentSubtask.nama,
          taskId: task._id,
          taskName: task.nama,
          workspaceId: workspace._id,
          workspaceName: workspace.nama,
          projectId: project._id,
          projectName: project.nama,
          senderId: requesterId,
          senderName: requester.username,
          recipientId: targetUser._id,
        });

        return {
          success: true,
          message: `${picEmail} berhasil ditambahkan sebagai PIC${
            !isMember ? " dan bergabung ke workspace sebagai member" : ""
          }`,
          notification, // Return notification untuk di-emit
        };
      } catch (notifError) {
        console.error("Error sending subtask PIC notification:", notifError);
        // Tetap return success meskipun notifikasi gagal
        return {
          success: true,
          message: `${picEmail} berhasil ditambahkan sebagai PIC${
            !isMember ? " dan bergabung ke workspace sebagai member" : ""
          }`,
        };
      }
    }

    // User belum terdaftar, kirim invitation
    const inviteToken = generateInviteToken();
    const inviteObject = createInviteObject(picEmail, inviteToken, {
      invitedBy: requesterId,
    });

    await Subtask.findByIdAndUpdate(subTaskId, {
      $push: { pendingPicInvites: inviteObject },
    });

    const inviteUrl = `${process.env.CLIENT_URL}/accept-pic-invite?subTaskId=${subTaskId}&token=${inviteToken}`;

    await sendSubtaskPicInvitationEmail({
      to: picEmail,
      subTaskName: subtask.nama,
      taskName: task.nama,
      projectName: project.nama,
      workspaceName: workspace.nama,
      inviteUrl,
      isRegistered: false,
    });

    return {
      success: true,
      invited: true,
      message: `Undangan PIC dikirim ke ${picEmail}. User perlu register terlebih dahulu dan akan otomatis mendapat role member`,
      needsRegistration: true,
    };
  } catch (error) {
    console.error("Error in handleSubtaskPicAssignment:", error);
    return {
      success: false,
      status: 500,
      message: "Terjadi kesalahan saat menambahkan PIC",
    };
  }
}

export async function acceptSubtaskPicInvite(req, res) {
  try {
    const { subTaskId } = req.params;
    const { token } = req.query;
    const { username, password, noHp, posisi, departemen, divisi } = req.body;

    const result = await getWorkspaceFromSubtask(subTaskId);
    if (!result.success) {
      return res.status(result.status).json(result);
    }

    const { subtask, workspace } = result;

    const validation = validateInviteToken(subtask.pendingPicInvites, token);
    if (!validation.valid) {
      if (validation.expired) {
        await Subtask.findByIdAndUpdate(subTaskId, {
          $pull: { pendingPicInvites: { token: token } },
        });
      }
      return res.status(validation.expired ? 400 : 404).json({
        success: false,
        message: validation.message,
      });
    }

    const invitedEmail = validation.inviteData.email;

    const userResult = await findOrCreateUser(invitedEmail, {
      username,
      password,
      noHp,
      posisi,
      departemen,
      divisi,
    });

    if (!userResult.success) {
      return res.status(400).json({
        success: false,
        message: userResult.message,
      });
    }

    const userId = userResult.user._id;

    await Workspace.findByIdAndUpdate(workspace._id, {
      $addToSet: { members: userId },
    });

    await User.findByIdAndUpdate(userId, {
      $addToSet: {
        workspaces: workspace._id,
        assignedSubtasks: subTaskId,
      },
    });

    await Subtask.findByIdAndUpdate(subTaskId, {
      $addToSet: { pic: userId },
      $pull: { pendingPicInvites: { token: token } },
    });

    res.status(200).json({
      success: true,
      message: "Berhasil menjadi PIC subtask dan bergabung ke workspace",
      data: {
        subtask: subtask.nama,
        workspace: workspace.nama,
        pic: userResult.user.username,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function removeSubtaskPic(req, res) {
  try {
    const { subTaskId } = req.params;
    const { userId } = req.body;

    const subtask = await Subtask.findById(subTaskId);
    if (!subtask) {
      return res.status(404).json({
        success: false,
        message: "Subtask tidak ditemukan",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId wajib diisi untuk menghapus PIC",
      });
    }

    const wasRemoved = subtask.pic.some(
      (id) => id.toString() === userId.toString()
    );

    if (!wasRemoved) {
      return res.status(404).json({
        success: false,
        message: "User bukan PIC dari subtask ini",
      });
    }

    const removedUser = await User.findById(userId).select("username email");
    const picBefore = [...subtask.pic];

    subtask.pic = subtask.pic.filter(
      (id) => id.toString() !== userId.toString()
    );
    await subtask.save();

    await User.findByIdAndUpdate(userId, {
      $pull: { assignedSubtasks: subtask._id },
    });

    const workspaceResult = await getWorkspaceFromSubtask(subTaskId);
    if (workspaceResult.success) {
      const { workspace, project, task, group } = workspaceResult;

      await createActivity({
        user: req.user._id,
        workspace: workspace._id,
        project: project._id,
        group: group._id,
        task: task._id,
        action: "REMOVE_SUBTASK_PIC",
        description: `User menghapus ${removedUser.username} dari PIC subtask "${subtask.nama}" pada task "${task.nama}"`,
        before: { pic: picBefore },
        after: { pic: subtask.pic },
      });
    }

    res.status(200).json({
      success: true,
      message: "PIC berhasil dihapus dari subtask",
      data: {
        removedUser: {
          _id: removedUser._id,
          username: removedUser.username,
          email: removedUser.email,
        },
        remainingPics: subtask.pic,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function verifySubtaskPicInvite(req, res) {
  try {
    const { subTaskId } = req.params;
    const { token } = req.query;

    const subtask = await Subtask.findById(subTaskId).populate("task");
    if (!subtask) {
      return res.status(404).json({
        success: false,
        message: "Subtask tidak ditemukan",
      });
    }

    const validation = validateInviteToken(subtask.pendingPicInvites, token);
    if (!validation.valid) {
      return res.status(validation.expired ? 400 : 404).json({
        success: false,
        message: validation.message,
      });
    }

    const result = await getWorkspaceFromSubtask(subTaskId);
    if (!result.success) {
      return res.status(result.status).json(result);
    }

    const { workspace, project, task } = result;

    res.status(200).json({
      success: true,
      data: {
        invitedEmail: validation.inviteData.email,
        subtaskName: subtask.nama,
        taskName: task.nama,
        projectName: project.nama,
        workspaceName: workspace.nama,
        expiresAt: validation.inviteData.expiresAt,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function deleteSubTask(req, res) {
  try {
    const { subTaskId } = req.params;
    const workspaceResult = await getWorkspaceFromSubtask(subTaskId);
    const subtask = await Subtask.findByIdAndDelete(subTaskId);
    if (!subtask) {
      return res
        .status(404)
        .json({ success: false, message: "Subtask not found" });
    }
    await Task.findByIdAndUpdate(subtask.task, {
      $pull: { subtask: subtask._id },
    });
    if (workspaceResult.success) {
      const { workspace, project, task, group } = workspaceResult;

      await createActivity({
        user: req.user._id,
        workspace: workspace._id,
        project: project._id,
        group: group._id,
        task: task._id,
        action: "DELETE_SUBTASK",
        description: `User menghapus subtask "${subtask.nama}" dari task "${task.nama}"`,
        before: {
          nama: subtask.nama,
          task: subtask.task,
        },
        after: {},
      });
    }
    res.status(200).json({
      success: true,
      message: "subtask deleted successfully",
      data: subtask,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function positionSubTask(req, res) {
  try {
    const { taskId } = req.params;
    const { subTaskId } = req.body;

    if (!Array.isArray(subTaskId)) {
      return res
        .status(400)
        .json({ success: false, message: "subTaskId must be an array" });
    }
    await Promise.all(
      subTaskId.map((id, position) =>
        Subtask.findByIdAndUpdate(id, { position, task: taskId })
      )
    );
    res.status(200).json({
      success: true,
      message: "Subtask positions updated successfully",
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getByTask(req, res) {
  try {
    const { task } = req.query;
    if (!task) {
      return res.status(400).json({
        message: "task wajib di setakan",
      });
    }
    const data = await Subtask.find({ task })
      .populate("pic", "username email photo")
      .sort({ position: 1 });

    res.status(200).json({
      success: true,
      message: "berhasil mengambil data",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
