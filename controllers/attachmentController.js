import Task from "../models/Task.js";
import Group from "../models/Group.js";
import User from "../models/User.js";
import path from "path";
import fs from "fs";
import { handleError } from "../utils/errorHandler.js";
import { createActivity } from "../helpers/activityhelper.js";
import { createAttachmentNotification } from "../helpers/notificationHelper.js";

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
      { new: true }
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
      for (const picId of task.pic) {
        if (picId.toString() !== req.user._id.toString()) {
          await createAttachmentNotification({
            recipientId: picId,
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
            io.to(`user:${picId}`).emit("notification:attachment", {
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
      path.basename(attachment.fileUrl)
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
      path.basename(attachment.fileUrl)
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
      `attachment; filename="${attachment.fileName}"`
    );

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    return handleError(res, error);
  }
}
