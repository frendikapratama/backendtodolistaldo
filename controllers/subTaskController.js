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
import { findOrCreateUser, addUserToWorkspace } from "../utils/userUtils.js";
import { sendSubtaskPicInvitationEmail } from "../utils/emailUtils.js";
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

    const { workspace, project, task } = result;

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
    if (
      targetUser &&
      workspace.members.some(
        (m) => m._id.toString() === targetUser._id.toString()
      )
    ) {
      await Subtask.findByIdAndUpdate(subTaskId, {
        $addToSet: { pic: targetUser._id },
      });

      if (!targetUser.assignedSubtasks.includes(subTaskId)) {
        targetUser.assignedSubtasks.push(subTaskId);
        await targetUser.save();
      }

      return {
        success: true,
        message: `${picEmail} berhasil ditambahkan sebagai PIC`,
      };
    }

    const inviteToken = generateInviteToken();
    const inviteObject = createInviteObject(picEmail, inviteToken, {
      invitedBy: requesterId,
    });

    await Subtask.findByIdAndUpdate(subTaskId, {
      $push: { pendingPicInvites: inviteObject },
    });

    const isRegistered = !!targetUser;
    const inviteUrl = `http://localhost:5173/accept-subtask-pic-invite?subTaskId=${subTaskId}&token=${inviteToken}${
      isRegistered ? "&registered=true" : ""
    }`;

    await sendSubtaskPicInvitationEmail({
      to: picEmail,
      subTaskName: subtask.nama,
      taskName: task.nama,
      projectName: project.nama,
      workspaceName: workspace.nama,
      inviteUrl,
      isRegistered,
    });

    return {
      success: true,
      invited: true,
      message: `Undangan PIC dikirim ke ${picEmail}. ${
        isRegistered
          ? "User akan otomatis join workspace"
          : "User perlu register terlebih dahulu"
      }`,
      needsRegistration: !isRegistered,
    };
  } catch (error) {
    throw error;
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
        subtask.pendingPicInvites = subtask.pendingPicInvites.filter(
          (inv) => inv.token !== token
        );
        await subtask.save();
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

    const { user } = userResult;

    await addUserToWorkspace(user._id, workspace._id);

    if (!subtask.pic.includes(user._id)) {
      subtask.pic.push(user._id);
    }
    subtask.pendingPicInvites = subtask.pendingPicInvites.filter(
      (inv) => inv.token !== token
    );
    await subtask.save();

    if (!user.assignedSubtasks.includes(subtask._id)) {
      user.assignedSubtasks.push(subtask._id);
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: "Berhasil menjadi PIC subtask dan bergabung ke workspace",
      data: {
        subtask: subtask.nama,
        workspace: workspace.nama,
        pic: user.username,
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

    const wasRemoved = subtask.pic.includes(userId);

    if (wasRemoved) {
      subtask.pic = subtask.pic.filter(
        (id) => id.toString() !== userId.toString()
      );
      await subtask.save();

      await User.findByIdAndUpdate(userId, {
        $pull: { assignedSubtasks: subtask._id },
      });

      res.status(200).json({
        success: true,
        message: "PIC berhasil dihapus dari subtask",
      });
    } else {
      res.status(404).json({
        success: false,
        message: "User bukan PIC dari subtask ini",
      });
    }
  } catch (error) {
    return handleError(res, error);
  }
}

export async function verifySubtaskPicInvite(req, res) {
  try {
    const { subTaskId } = req.params;
    const { token } = req.query;

    const subtask = await Subtask.findById(subTaskId);
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
    const subtask = await Subtask.findByIdAndDelete(subTaskId);
    if (!subtask) {
      return res
        .status(404)
        .json({ success: false, message: "Subtask not found" });
    }
    await Task.findByIdAndUpdate(subtask.task, {
      $pull: { subtask: subtask._id },
    });
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
    const data = await Subtask.find({ task });

    res.status(200).json({
      success: true,
      message: "berhasil mengambil data",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
