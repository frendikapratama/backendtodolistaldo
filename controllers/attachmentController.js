import Task from "../models/Task.js";
import Group from "../models/Group.js";
import User from "../models/User.js";
import path from "path";
import fs from "fs";
import { handleError } from "../utils/errorHandler.js";
import { createActivity } from "../helpers/activityhelper.js";
import { createAttachmentNotification } from "../helpers/notificationHelper.js";
import Subtask from "../models/Subtask.js";
import { getWorkspaceFromSubtask } from "../utils/workspaceUtils.js";

export async function addAttachment(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const attachmentData = {
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      fileUrl: `/uploads/attachments/${req.file.filename}`,
      uploadedBy: req.user?._id || null,
    };

    const task = await Task.findByIdAndUpdate(
      req.params.taskId,
      { $push: { attachments: attachmentData } },
      { new: true },
    )
      .populate("attachments.uploadedBy", "username email")
      .populate("groups")
      .populate("pic", "username email");

    if (!task) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    const group = await Group.findById(task.groups);
    const sender = await User.findById(req.user._id).select("username email");

    await createActivity({
      user: req.user._id,
      workspace: task.workspace,
      project: group?.project,
      group: group?._id,
      task: task._id,
      action: "UPLOAD_FILE",
      description: `User uploaded file "${req.file.originalname}" to task ${task.nama}`,
      before: {},
      after: {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileType: req.file.mimetype,
        fileUrl: attachmentData.fileUrl,
      },
    });

    // Get io instance from app
    const io = req.app.get("io");

    // Create notification dan emit socket untuk semua PIC (kecuali yang upload)
    if (task.pic && task.pic.length > 0) {
      for (const pic of task.pic) {
        // Ekstrak ID yang benar dari object atau string
        const picUserId = pic._id ? pic._id.toString() : pic.toString();

        if (picUserId !== req.user._id.toString()) {
          await createAttachmentNotification({
            recipientId: picUserId, // Gunakan ID yang sudah diekstrak
            senderId: req.user._id,
            taskId: task._id,
            taskName: task.nama,
            workspaceId: task.workspace,
            projectId: group?.project,
            senderName: sender.username,
            fileName: req.file.originalname,
            fileUrl: attachmentData.fileUrl,
          });

          // Emit real-time notification via Socket.IO
          if (io) {
            io.to(`user:${picUserId}`).emit("notification:attachment", {
              // Gunakan picUserId
              type: "TASK_ATTACHMENT_UPLOADED",
              title: "File Uploaded to Task",
              message: `${sender.username} uploaded a file "${req.file.originalname}" to "${task.nama}"`,
              taskId: task._id,
              taskName: task.nama,
              fileName: req.file.originalname,
              fileUrl: attachmentData.fileUrl,
              senderName: sender.username,
              senderId: req.user._id,
              workspaceId: task.workspace,
              projectId: group?.project,
              fileSize: req.file.size,
              fileType: req.file.mimetype,
              timestamp: new Date(),
            });
          }
        }
      }
    }

    res.status(201).json({
      success: true,
      message: "File uploaded successfully",
      data: attachmentData,
      task: task,
    });
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    return handleError(res, error);
  }
}

export async function deleteAttachment(req, res) {
  try {
    const { taskId, attachmentId } = req.params;

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    const attachment = task.attachments.id(attachmentId);
    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: "Attachment not found",
      });
    }
    if (attachment.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete this attachment",
      });
    }
    const deletedFileData = {
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      fileType: attachment.fileType,
      fileUrl: attachment.fileUrl,
    };

    const filePath = path.join(
      process.cwd(),
      "uploads",
      "attachments",
      path.basename(attachment.fileUrl),
    );

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    task.attachments.pull(attachmentId);
    await task.save();

    const group = await Group.findById(task.groups);

    await createActivity({
      user: req.user._id,
      workspace: task.workspace,
      project: group?.project,
      group: group?._id,
      task: task._id,
      action: "DELETE_FILE",
      description: `User deleted file "${deletedFileData.fileName}" from task ${task.nama}`,
      before: deletedFileData,
      after: {},
    });

    res.status(200).json({
      success: true,
      message: "Attachment deleted successfully",
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getTaskAttachments(req, res) {
  try {
    const task = await Task.findById(req.params.taskId)
      .select("attachments")
      .populate("attachments.uploadedBy", "username email");

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Attachments retrieved successfully",
      data: task.attachments,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function downloadAttachment(req, res) {
  try {
    const { taskId, attachmentId } = req.params;

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    const attachment = task.attachments.id(attachmentId);
    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: "Attachment not found",
      });
    }

    const filePath = path.join(
      process.cwd(),
      "uploads",
      "attachments",
      path.basename(attachment.fileUrl),
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "File not found on server",
      });
    }

    const group = await Group.findById(task.groups);

    await createActivity({
      user: req.user._id,
      workspace: task.workspace,
      project: group?.project,
      group: group?._id,
      task: task._id,
      action: "DOWNLOAD_FILE",
      description: `User downloaded file "${attachment.fileName}" from task ${task.nama}`,
      before: {},
      after: {
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        fileType: attachment.fileType,
      },
    });

    res.setHeader("Content-Type", attachment.fileType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${attachment.fileName}"`,
    );

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function addSubtaskAttachment(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const { subTaskId } = req.params;

    const subtask = await Subtask.findById(subTaskId);
    if (!subtask) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({
        success: false,
        message: "Subtask not found",
      });
    }

    const attachmentData = {
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      fileUrl: `/uploads/attachments/${req.file.filename}`,
      uploadedBy: req.user?._id || null,
    };

    const updatedSubtask = await Subtask.findByIdAndUpdate(
      subTaskId,
      { $push: { attachments: attachmentData } },
      { new: true },
    )
      .populate("attachments.uploadedBy", "username email")
      .populate("pic", "username email");

    const workspaceResult = await getWorkspaceFromSubtask(subTaskId);
    const sender = await User.findById(req.user._id).select("username email");

    if (workspaceResult.success) {
      const { workspace, project, task, group } = workspaceResult;

      await createActivity({
        user: req.user._id,
        workspace: workspace._id,
        project: project._id,
        group: group._id,
        task: task._id,
        action: "UPLOAD_SUBTASK_FILE",
        description: `uploaded file "${req.file.originalname}" to subtask "${subtask.nama}"`,
        before: {},
        after: {
          fileName: req.file.originalname,
          fileSize: req.file.size,
          fileType: req.file.mimetype,
          fileUrl: attachmentData.fileUrl,
        },
      });
    }

    // Get io instance from app
    const io = req.app.get("io");

    // Create notification dan emit socket untuk semua PIC (kecuali yang upload)
    if (updatedSubtask.pic && updatedSubtask.pic.length > 0) {
      for (const pic of updatedSubtask.pic) {
        const picUserId = pic._id ? pic._id.toString() : pic.toString();

        if (picUserId !== req.user._id.toString()) {
          await createAttachmentNotification({
            recipientId: picUserId,
            senderId: req.user._id,
            taskId: subtask.task,
            taskName: workspaceResult.success
              ? workspaceResult.task.nama
              : "Unknown",
            workspaceId: workspaceResult.success
              ? workspaceResult.workspace._id
              : null,
            projectId: workspaceResult.success
              ? workspaceResult.project._id
              : null,
            senderName: sender.username,
            fileName: req.file.originalname,
            fileUrl: attachmentData.fileUrl,
          });

          // Emit real-time notification via Socket.IO
          if (io) {
            io.to(`user:${picUserId}`).emit("notification:attachment", {
              type: "SUBTASK_ATTACHMENT_UPLOADED",
              title: "File Uploaded to Subtask",
              message: `${sender.username} uploaded a file "${req.file.originalname}" to subtask "${subtask.nama}"`,
              subtaskId: subtask._id,
              subtaskName: subtask.nama,
              taskId: subtask.task,
              fileName: req.file.originalname,
              fileUrl: attachmentData.fileUrl,
              senderName: sender.username,
              senderId: req.user._id,
              workspaceId: workspaceResult.success
                ? workspaceResult.workspace._id
                : null,
              projectId: workspaceResult.success
                ? workspaceResult.project._id
                : null,
              fileSize: req.file.size,
              fileType: req.file.mimetype,
              timestamp: new Date(),
            });
          }
        }
      }
    }

    res.status(201).json({
      success: true,
      message: "File uploaded successfully to subtask",
      data: attachmentData,
      subtask: updatedSubtask,
    });
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    return handleError(res, error);
  }
}

export async function deleteSubtaskAttachment(req, res) {
  try {
    const { subTaskId, attachmentId } = req.params;

    const subtask = await Subtask.findById(subTaskId);
    if (!subtask) {
      return res.status(404).json({
        success: false,
        message: "Subtask not found",
      });
    }

    const attachment = subtask.attachments.id(attachmentId);
    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: "Attachment not found",
      });
    }
    if (attachment.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete this attachment",
      });
    }
    const deletedFileData = {
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      fileType: attachment.fileType,
      fileUrl: attachment.fileUrl,
    };

    const filePath = path.join(
      process.cwd(),
      "uploads",
      "attachments",
      path.basename(attachment.fileUrl),
    );

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    subtask.attachments.pull(attachmentId);
    await subtask.save();

    const workspaceResult = await getWorkspaceFromSubtask(subTaskId);

    if (workspaceResult.success) {
      const { workspace, project, task, group } = workspaceResult;

      await createActivity({
        user: req.user._id,
        workspace: workspace._id,
        project: project._id,
        group: group._id,
        task: task._id,
        action: "DELETE_SUBTASK_FILE",
        description: `User deleted file "${deletedFileData.fileName}" from subtask "${subtask.nama}"`,
        before: deletedFileData,
        after: {},
      });
    }

    res.status(200).json({
      success: true,
      message: "Attachment deleted successfully",
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getSubtaskAttachments(req, res) {
  try {
    const { subTaskId } = req.params;

    const subtask = await Subtask.findById(subTaskId)
      .select("attachments")
      .populate("attachments.uploadedBy", "username email");

    if (!subtask) {
      return res.status(404).json({
        success: false,
        message: "Subtask not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Attachments retrieved successfully",
      data: subtask.attachments,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function downloadSubtaskAttachment(req, res) {
  try {
    const { subTaskId, attachmentId } = req.params;

    const subtask = await Subtask.findById(subTaskId);
    if (!subtask) {
      return res.status(404).json({
        success: false,
        message: "Subtask not found",
      });
    }

    const attachment = subtask.attachments.id(attachmentId);
    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: "Attachment not found",
      });
    }

    const filePath = path.join(
      process.cwd(),
      "uploads",
      "attachments",
      path.basename(attachment.fileUrl),
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "File not found on server",
      });
    }

    const workspaceResult = await getWorkspaceFromSubtask(subTaskId);

    if (workspaceResult.success) {
      const { workspace, project, task, group } = workspaceResult;

      await createActivity({
        user: req.user._id,
        workspace: workspace._id,
        project: project._id,
        group: group._id,
        task: task._id,
        action: "DOWNLOAD_SUBTASK_FILE",
        description: `downloaded file "${attachment.fileName}" from subtask "${subtask.nama}"`,
        before: {},
        after: {
          fileName: attachment.fileName,
          fileSize: attachment.fileSize,
          fileType: attachment.fileType,
        },
      });
    }

    res.setHeader("Content-Type", attachment.fileType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${attachment.fileName}"`,
    );

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    return handleError(res, error);
  }
}
