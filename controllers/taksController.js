import Task from "../models/Task.js";
import Group from "../models/Group.js";
import Subtask from "../models/Subtask.js";
import User from "../models/User.js";
import { getWorkspaceFromTask } from "../utils/workspaceUtils.js";
import {
  validateInviteToken,
  generateInviteToken,
  createInviteObject,
} from "../utils/inviteUtils.js";
import { findOrCreateUser } from "../utils/userUtils.js";
import { sendTaskPicInvitationEmail } from "../utils/emailUtils.js";
import { handleError } from "../utils/errorHandler.js";
import Workspace from "../models/Workspace.js";
import { createActivity } from "../helpers/activityhelper.js";

import {
  createTaskStatusNotification,
  createTaskAssignmentNotification,
} from "../helpers/notificationHelper.js";
import { emitNotificationToUser } from "../sockets/socketHandler.js";

async function getProjectAndWorkspaceFromGroup(groupId) {
  try {
    const group = await Group.findById(groupId).populate({
      path: "project",
      populate: {
        path: "workspace",
        select: "_id nama",
      },
    });
    if (!group) {
      return { success: false, message: "Group not found" };
    }
    if (!group.project) {
      return { success: false, message: "Group has no project" };
    }
    if (!group.project.workspace) {
      return { success: false, message: "Project has no workspace" };
    }
    return {
      success: true,
      projectId: group.project._id,
      workspaceId: group.project.workspace._id,
    };
  } catch (error) {
    console.error("Error getting project/workspace from group:", error);
    return { success: false, message: "Error getting project/workspace" };
  }
}

export async function getTasksByProjectSimple(req, res) {
  try {
    const { projectId } = req.params;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "Project ID wajib disertakan",
      });
    }
    const groups = await Group.find({ project: projectId });
    const tasksByGroup = await Promise.all(
      groups.map(async (group) => {
        const tasks = await Task.find({ groups: group._id })
          .populate("pic", "username email")
          .populate("subtask")
          .populate("workspace", "nama")
          .populate("project", "nama")
          .sort({ position: 1 });

        return {
          groupId: group._id,
          groupName: group.nama,
          groupDescription: group.description,
          tasks: tasks,
        };
      }),
    );
    res.status(200).json({
      success: true,
      message: "Berhasil mengambil data task berdasarkan project",
      data: tasksByGroup,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getTask(req, res) {
  try {
    const data = await Task.find()
      .sort({ createdAt: -1 })
      .populate("workspace", "nama")
      .populate("groups", "nama")
      .populate("project", "nama");
    res.status(200).json(data);
  } catch (error) {
    return handleError(res, error);
  }
}
export async function createTask(req, res) {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) {
      return res
        .status(404)
        .json({ success: false, message: "Group not found" });
    }
    const relationResult = await getProjectAndWorkspaceFromGroup(groupId);
    if (!relationResult.success) {
      return res.status(404).json({
        success: false,
        message: relationResult.message,
      });
    }
    const lastTask = await Task.findOne({ groups: groupId })
      .sort({ position: -1 })
      .limit(1);
    const nextPosition = lastTask ? lastTask.position + 1 : 0;
    const task = await Task.create({
      ...req.body,
      groups: groupId,
      project: relationResult.projectId,
      workspace: relationResult.workspaceId,
      position: nextPosition,
    });

    await Group.findByIdAndUpdate(groupId, {
      $push: { task: task._id },
    });

    await createActivity({
      user: req.user._id,
      workspace: task.workspace,
      project: task.project,
      group: groupId,
      task: task._id,
      action: "CREATE_TASK",
      description: `${req.user.username} membuat task ${task.nama}`,
      before: {},
      after: {
        taskId: task._id,
        taskName: task.nama,
        nama: task.nama,
        groups: groupId,
        project: task.project,
        workspace: task.workspace,
      },
    });

    const populatedTask = await Task.findById(task._id)
      .populate("workspace", "nama")
      .populate("project", "nama");

    res.status(201).json({
      success: true,
      message: "task created successfully",
      data: populatedTask,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

const validateStatusTransition = (oldStatus, newStatus) => {
  const transitionRules = {
    "Done-In review": ["Done", "In Progress"],
  };

  if (transitionRules[oldStatus]) {
    return transitionRules[oldStatus].includes(newStatus);
  }

  return true;
};

export async function updateTask(req, res) {
  try {
    const { taskId } = req.params;
    const { groupId, position, picEmail, ...updateData } = req.body;
    let isStatusChanged = false;

    const oldTask = await Task.findById(taskId).populate("groups").lean();
    if (!oldTask) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    if (updateData.status && updateData.status !== oldTask.status) {
      isStatusChanged = true;

      if (!validateStatusTransition(oldTask.status, updateData.status)) {
        return res.status(400).json({
          success: false,
          message: `Transisi status tidak diizinkan: dari "${oldTask.status}" ke "${updateData.status}"`,
        });
      }
    }

    if (picEmail) {
      const emails = Array.isArray(picEmail) ? picEmail : [picEmail];
      const io = req.app.get("io");

      for (const email of emails) {
        const picResult = await handlePicAssignment(
          taskId,
          email,
          oldTask,
          req.user._id,
        );

        if (!picResult.success) {
          return res.status(picResult.status || 400).json(picResult);
        }

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
            `Sent PIC assignment notification to user ${picResult.notification.recipient}`,
          );
        }
      }

      const refreshedTask = await Task.findById(taskId);
      updateData.pic = refreshedTask.pic;
    }
    if (groupId && groupId !== String(oldTask.groups)) {
      await Group.findByIdAndUpdate(oldTask.groups, {
        $pull: { task: oldTask._id },
      });
      await Group.findByIdAndUpdate(groupId, {
        $push: { task: oldTask._id },
      });
      const relationResult = await getProjectAndWorkspaceFromGroup(groupId);
      if (relationResult.success) {
        updateData.project = relationResult.projectId;
        updateData.workspace = relationResult.workspaceId;
      }
      if (position !== undefined && position !== null) {
        const tasksInNewGroup = await Task.find({ groups: groupId }).sort({
          position: 1,
        });
        const updatePromises = tasksInNewGroup
          .map((task, idx) => {
            if (idx >= position) {
              return Task.findByIdAndUpdate(task._id, {
                position: idx + 1,
              });
            }
            return null;
          })
          .filter(Boolean);
        await Promise.all(updatePromises);
        updateData.position = position;
      }
      updateData.groups = groupId;
    }
    const updatedTask = await Task.findByIdAndUpdate(taskId, updateData, {
      new: true,
    })
      .populate("pic", "username email")
      .populate("workspace", "nama")
      .populate("project", "nama");
    const before = {};
    const after = {};
    for (const key in updateData) {
      const oldValue = oldTask[key];
      const newValue = updateData[key];
      const oldStr = String(oldValue);
      const newStr = String(newValue);
      if (oldStr !== newStr) {
        before[key] = oldValue;
        after[key] = newValue;
      }
    }

    if (Object.keys(before).length > 0) {
      const group = await Group.findById(updatedTask.groups);
      before.taskId = updatedTask._id;
      before.taskName = updatedTask.nama;
      after.taskId = updatedTask._id;
      after.taskName = updatedTask.nama;

      await createActivity({
        user: req.user._id,
        kuarter: updatedTask.kuarter,
        workspace: updatedTask.workspace,
        project: updatedTask.project,
        group: updatedTask.groups,
        task: taskId,
        action: "UPDATE_TASK",
        description: `${req.user.username} update task`,
        before,
        after,
      });
    }

    if (isStatusChanged && updatedTask.pic && updatedTask.pic.length > 0) {
      try {
        const group = await Group.findById(updatedTask.groups).populate({
          path: "project",
          populate: {
            path: "workspace",
            select: "nama owner members",
          },
        });

        const workspace = group.project.workspace;
        const recipientIds = workspace.members
          .map((member) => member.user)
          .filter((userId) => userId.toString() !== req.user._id.toString());

        const notifications = await createTaskStatusNotification({
          taskId: updatedTask._id,
          taskName: updatedTask.nama,
          workspaceId: workspace._id,
          workspaceName: workspace.nama,
          projectId: group.project._id,
          projectName: group.project.nama,
          senderId: req.user._id,
          senderName: req.user.username,
          recipients: recipientIds,
          oldStatus: oldTask.status,
          newStatus: updatedTask.status,
        });

        const io = req.app.get("io");
        notifications.forEach((notification) => {
          emitNotificationToUser(io, notification.recipient, {
            _id: notification._id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            metadata: notification.metadata,
            task: notification.task,
            isRead: notification.isRead,
            createdAt: new Date(),
          });
        });

        console.log(
          `Sent ${notifications.length} status change notifications to all workspace members`,
        );
      } catch (notifError) {
        console.error("Error sending notifications:", notifError);
      }
    }

    res.status(200).json({
      success: true,
      message: "Task updated successfully",
      data: updatedTask,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateTaskPositions(req, res) {
  try {
    const { groupId } = req.params;
    const { taskIds } = req.body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "taskIds harus berupa array dan tidak boleh kosong",
      });
    }

    const tasksInGroup = await Task.find({
      _id: { $in: taskIds },
      groups: groupId,
    });

    if (tasksInGroup.length !== taskIds.length) {
      return res.status(400).json({
        success: false,
        message: "Beberapa task tidak ada di group ini",
      });
    }

    const updatePromises = taskIds.map((id, index) =>
      Task.findByIdAndUpdate(id, { position: index }, { new: true }),
    );

    const updatedTasks = await Promise.all(updatePromises);

    res.status(200).json({
      success: true,
      message: "Task positions updated successfully",
      data: updatedTasks,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function deleteTask(req, res) {
  try {
    const { taskId } = req.params;
    const task = await Task.findByIdAndDelete(taskId);

    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    await Subtask.deleteMany({ task: taskId });
    await Group.findByIdAndUpdate(task.groups, {
      $pull: { task: task._id },
    });

    const group = await Group.findById(task.groups);
    await createActivity({
      user: req.user._id,
      workspace: task.workspace,
      project: task.project,
      group: task.groups,
      task: taskId,
      action: "DELETE_TASK",
      description: `${req.user.username} delete task `,
      before: {
        taskId: task._id,
        taskName: task.nama,
        nama: task.nama,
        groups: task.groups,
        project: task.project,
        workspace: task.workspace,
      },
      after: {},
    });

    res.status(200).json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    console.error("Delete Task Error:", error);
    return handleError(res, error);
  }
}

export const getTasksByGroup = async (req, res) => {
  try {
    const {
      groups,
      search,
      status,
      priority,
      note,
      picEmail,
      startDate,
      endDate,
    } = req.query;

    if (!groups) {
      return res.status(400).json({ message: "groupId wajib disertakan" });
    }

    let query = { groups };

    if (search && search.trim() !== "") {
      query.nama = { $regex: search.trim(), $options: "i" };
    }

    if (status && status.trim() !== "" && status !== "all") {
      query.status = status;
    }

    if (priority && priority.trim() !== "" && priority !== "all") {
      query.priority = priority;
    }

    if (note && note.trim() !== "" && note !== "all") {
      query.note = note;
    }

    if (picEmail && picEmail.trim() !== "") {
      const User = require("../models/User");
      const matchingUser = await User.findOne({
        email: { $regex: picEmail.trim(), $options: "i" },
      }).select("_id");

      if (matchingUser) {
        query.pic = matchingUser._id;
      } else {
        return res.status(200).json({
          success: true,
          message: "berhasil mengambil data",
          data: [],
          count: 0,
        });
      }
    }

    if (startDate && endDate) {
      query.start_date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const tasks = await Task.find(query)
      .populate({
        path: "subtask",
        options: { sort: { position: 1 } },
      })
      .populate({
        path: "pic",
        select: "username email photo",
      })
      .populate("workspace", "nama")
      .populate("project", "nama")
      .sort({ position: 1 });

    res.status(200).json({
      success: true,
      message: "berhasil mengambil data",
      data: tasks,
      count: tasks.length,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

async function handlePicAssignment(taskId, picEmail, task, requesterId) {
  try {
    const result = await getWorkspaceFromTask(taskId);
    if (!result.success) {
      return result;
    }

    const { workspace, project } = result;

    const targetUser = await User.findOne({ email: picEmail });
    const currentTask = await Task.findById(taskId);

    if (
      currentTask.pic &&
      currentTask.pic.some(
        (id) => targetUser && id.toString() === targetUser._id.toString(),
      )
    ) {
      return {
        success: true,
        message: "User sudah menjadi PIC task ini",
      };
    }

    if (targetUser) {
      const isMember = workspace.members.some(
        (m) => m.user.toString() === targetUser._id.toString(),
      );

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

      await Task.findByIdAndUpdate(taskId, {
        $addToSet: { pic: targetUser._id },
      });

      if (!targetUser.assignedTasks.includes(taskId)) {
        targetUser.assignedTasks.push(taskId);
        await targetUser.save();
      }

      try {
        const group = await Group.findById(currentTask.groups);
        const requester = await User.findById(requesterId);

        const notification = await createTaskAssignmentNotification({
          taskId: currentTask._id,
          taskName: currentTask.nama,
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
          notification,
        };
      } catch (notifError) {
        console.error("Error sending PIC notification:", notifError);
        return {
          success: true,
          message: `${picEmail} berhasil ditambahkan sebagai PIC${
            !isMember ? " dan bergabung ke workspace sebagai member" : ""
          }`,
        };
      }
    }

    const inviteToken = generateInviteToken();
    const inviteObject = createInviteObject(picEmail, inviteToken, {
      invitedBy: requesterId,
    });

    await Task.findByIdAndUpdate(taskId, {
      $push: { pendingPicInvites: inviteObject },
    });

    const inviteUrl = `${process.env.CLIENT_URL}/accept-pic-invite?taskId=${taskId}&token=${inviteToken}`;

    await sendTaskPicInvitationEmail({
      to: picEmail,
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
    console.error("Error in handlePicAssignment:", error);
    return {
      success: false,
      status: 500,
      message: "Terjadi kesalahan saat menambahkan PIC",
    };
  }
}

export async function acceptPicInvite(req, res) {
  try {
    const { taskId } = req.params;
    const { token } = req.query;
    const { username, password, noHp, posisi, departemen, divisi } = req.body;

    const result = await getWorkspaceFromTask(taskId);
    if (!result.success) {
      return res.status(result.status).json(result);
    }

    const { task, workspace } = result;

    const validation = validateInviteToken(task.pendingPicInvites, token);
    if (!validation.valid) {
      if (validation.expired) {
        await Task.findByIdAndUpdate(taskId, {
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

    const isMember = workspace.members.some(
      (m) => m.user.toString() === userId.toString(),
    );

    if (!isMember) {
      await Workspace.findByIdAndUpdate(workspace._id, {
        $push: {
          members: {
            user: userId,
            role: "member",
          },
        },
      });

      await User.findByIdAndUpdate(userId, {
        $push: {
          workspaces: {
            workspace: workspace._id,
            role: "member",
          },
        },
      });
    }

    await User.findByIdAndUpdate(userId, {
      $addToSet: {
        assignedTasks: taskId,
      },
    });

    await Task.findByIdAndUpdate(taskId, {
      $addToSet: { pic: userId },
      $pull: { pendingPicInvites: { token: token } },
    });

    res.status(200).json({
      success: true,
      message:
        "Berhasil menjadi PIC task dan bergabung ke workspace sebagai member",
      data: {
        task: task.nama,
        workspace: workspace.nama,
        pic: userResult.user.username,
        role: "member",
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function removePic(req, res) {
  try {
    const { taskId } = req.params;
    const { userId } = req.body;

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task tidak ditemukan",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId wajib diisi untuk menghapus PIC",
      });
    }

    const wasRemoved = task.pic.some(
      (id) => id.toString() === userId.toString(),
    );

    if (!wasRemoved) {
      return res.status(404).json({
        success: false,
        message: "User bukan PIC dari task ini",
      });
    }

    const removedUser = await User.findById(userId).select("username email");
    const picBefore = [...task.pic];

    task.pic = task.pic.filter((id) => id.toString() !== userId.toString());
    await task.save();

    await User.findByIdAndUpdate(userId, {
      $pull: { assignedTasks: task._id },
    });

    const group = await Group.findById(task.groups);
    await createActivity({
      user: req.user._id,
      workspace: task.workspace,
      project: task.project,
      group: task.groups,
      task: taskId,
      action: "REMOVE_PIC",
      description: `User menghapus ${removedUser.username} dari PIC task "${task.nama}"`,
      before: { pic: picBefore },
      after: { pic: task.pic },
    });

    res.status(200).json({
      success: true,
      message: "PIC berhasil dihapus dari task",
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function removeAllPics(req, res) {
  try {
    const { taskId } = req.params;

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task tidak ditemukan",
      });
    }

    for (const picId of task.pic) {
      await User.findByIdAndUpdate(picId, {
        $pull: { assignedTasks: task._id },
      });
    }

    task.pic = [];
    await task.save();

    res.status(200).json({
      success: true,
      message: "Semua PIC berhasil dihapus dari task",
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function verifyPicInvite(req, res) {
  try {
    const { taskId } = req.params;
    const { token } = req.query;

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task tidak ditemukan",
      });
    }

    const validation = validateInviteToken(task.pendingPicInvites, token);
    if (!validation.valid) {
      return res.status(validation.expired ? 400 : 404).json({
        success: false,
        message: validation.message,
      });
    }

    const result = await getWorkspaceFromTask(taskId);
    if (!result.success) {
      return res.status(result.status).json(result);
    }

    const { workspace, project } = result;

    res.status(200).json({
      success: true,
      data: {
        invitedEmail: validation.inviteData.email,
        taskName: task.nama,
        projectName: project.nama,
        workspaceName: workspace.nama,
        expiresAt: validation.inviteData.expiresAt,
        role: "member",
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateMeetingLink(req, res) {
  try {
    const { taskId } = req.params;
    const { meetingLink } = req.body;

    const task = await Task.findByIdAndUpdate(
      taskId,
      { meetingLink },
      { new: true },
    );

    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    res.status(200).json({
      success: true,
      message: "Meeting link updated successfully",
      data: task,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getMyTasks(req, res) {
  try {
    const userId = req.user._id;

    const tasks = await Task.find({
      pic: userId,
    })
      .populate("workspace", "nama")
      .populate("project", "nama")
      .populate({
        path: "groups",
        select: "nama",
      })
      .populate("pic", "username email")
      .populate({
        path: "subtask",
        options: { sort: { position: 1 } },
      });

    const tasksWithDueDate = tasks
      .filter((task) => task.due_date)
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    const tasksWithoutDueDate = tasks
      .filter((task) => !task.due_date)
      .sort((a, b) => a.position - b.position);

    const sortedTasks = [...tasksWithDueDate, ...tasksWithoutDueDate];

    const formattedTasks = sortedTasks.map((task) => {
      const group = Array.isArray(task.groups) ? task.groups[0] : task.groups;

      return {
        _id: task._id,
        nama: task.nama,
        status: task.status,
        priority: task.priority,
        start_date: task.start_date,
        due_date: task.due_date,
        meeting_date: task.meeting_date,
        finish_date: task.finish_date,
        note: task.note,
        meeting_link: task.meeting_link,
        description: task.description,
        pic: task.pic,
        subtask: task.subtask,
        workspace: task.workspace?.nama || "-",
        project: task.project?.nama || "-",
        group: group?.nama || "-",
        groupId: group?._id,
        projectId: task.project?._id,
        workspaceId: task.workspace?._id,
        subtaskStats: {
          total: task.subtask?.length || 0,
          completed:
            task.subtask?.filter((st) => st.status === "selesai").length || 0,
        },
      };
    });

    res.status(200).json({
      success: true,
      message: "Berhasil mengambil data My Work",
      data: {
        tasks: formattedTasks,
        totalTasks: formattedTasks.length,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getMyTasksWithMeetings(req, res) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const userId = req.user._id;

    const tasksWithMeetings = await Task.find({
      meeting_date: { $exists: true, $ne: null },
      pic: userId,
    })
      .populate("workspace", "nama")
      .populate("project", "nama")
      .populate({
        path: "groups",
        select: "nama",
      })
      .populate("pic", "username email")
      .populate({
        path: "subtask",
        match: {
          meeting_date: { $exists: true, $ne: null },
          pic: userId,
        },
        options: { sort: { position: 1 } },
      })
      .sort({ meeting_date: 1, due_date: 1 });

    const allSubtasksWithMeetings = await Subtask.find({
      meeting_date: { $exists: true, $ne: null },
      pic: userId,
    })
      .populate({
        path: "task",
        select: "nama groups pic meeting_date workspace project",
        populate: [
          {
            path: "workspace",
            select: "nama",
          },
          {
            path: "project",
            select: "nama",
          },
          {
            path: "groups",
            select: "nama",
          },
          {
            path: "pic",
            select: "username email",
          },
        ],
      })
      .sort({ meeting_date: 1 });

    const formattedTasks = tasksWithMeetings.map((task) => {
      const group = Array.isArray(task.groups) ? task.groups[0] : task.groups;

      return {
        _id: task._id,
        type: "task",
        nama: task.nama,
        status: task.status,
        priority: task.priority,
        start_date: task.start_date,
        due_date: task.due_date,
        meeting_date: task.meeting_date,
        finish_date: task.finish_date,
        note: task.note,
        meeting_link: task.meeting_link,
        description: task.description,
        pic: task.pic,
        workspace: task.workspace?.nama || "-",
        project: task.project?.nama || "-",
        group: group?.nama || "-",
        groupId: group?._id,
        projectId: task.project?._id,
        workspaceId: task.workspace?._id,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      };
    });

    const formattedSubtasks = allSubtasksWithMeetings.map((subtask) => {
      const task = subtask.task;
      const group = Array.isArray(task?.groups)
        ? task?.groups[0]
        : task?.groups;

      return {
        _id: subtask._id,
        type: "subtask",
        nama: subtask.nama,
        status: subtask.status,
        priority: subtask.priority,
        start_date: subtask.start_date,
        due_date: subtask.due_date,
        meeting_date: subtask.meeting_date,
        finish_date: subtask.finish_date,
        note: subtask.note,
        meeting_link: subtask.meeting_link,
        description: subtask.description,
        pic: subtask.pic,
        parentTask: {
          _id: task?._id,
          nama: task?.nama,
          status: task?.status,
          meeting_date: task?.meeting_date,
        },
        workspace: task?.workspace?.nama || "-",
        project: task?.project?.nama || "-",
        group: group?.nama || "-",
        groupId: group?._id,
        projectId: task?.project?._id,
        workspaceId: task?.workspace?._id,
        createdAt: subtask.createdAt,
        updatedAt: subtask.updatedAt,
      };
    });

    const allItems = [...formattedTasks, ...formattedSubtasks]
      .filter((item) => item.meeting_date)
      .sort((a, b) => new Date(a.meeting_date) - new Date(b.meeting_date));

    res.status(200).json({
      success: true,
      message:
        "Berhasil mengambil data tasks dan subtasks dengan meeting milik user",
      data: allItems,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
