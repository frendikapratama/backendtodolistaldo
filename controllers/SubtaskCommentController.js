import SubtaskComment from "../models/SubtaskComment.js";
import { handleError } from "../utils/errorHandler.js";
import { createActivity } from "../helpers/activityhelper.js";
import {
  createCommentNotification,
  createReplyCommentNotification,
} from "../helpers/notificationHelper.js";
import Group from "../models/Group.js";
import Subtask from "../models/Subtask.js";
import Task from "../models/Task.js";
import User from "../models/User.js";

export async function createSubtaskComment(req, res) {
  try {
    const { subtaskId } = req.params;
    const { text } = req.body;
    const userId = req.user._id;

    const subtask = await Subtask.findById(subtaskId)
      .populate("task")
      .populate("pic", "username email");

    if (!subtask) {
      return res.status(404).json({
        success: false,
        message: "Subtask tidak ditemukan",
      });
    }

    const comment = await SubtaskComment.create({
      subtask: subtaskId,
      user: userId,
      text,
      parentComment: null,
      depth: 0,
    });

    const task = await Task.findById(subtask.task);
    const group = await Group.findById(task.groups);
    const sender = await User.findById(userId).select("username email");

    await createActivity({
      user: userId,
      workspace: task.workspace,
      project: group?.project,
      group: group?._id,
      task: task._id,
      action: "SUBTASK_COMMENT",
      description: `User commented on subtask ${subtask.nama}`,
      before: {},
      after: {
        text: comment.text,
        commentId: comment._id,
        subtaskId: subtask._id,
      },
    });

    // Get io instance from app
    const io = req.app.get("io");

    // Cari semua user yang pernah komentar di subtask ini
    const allCommenters = await SubtaskComment.find({ subtask: subtaskId })
      .distinct("user")
      .lean();

    // Gabungkan PIC dan commenters
    const allPicIds = subtask.pic.map((pic) => pic._id.toString());
    const allCommenterIds = allCommenters.map((commenter) =>
      commenter.toString()
    );

    // Gabungkan semua user yang perlu dikirim notifikasi
    const uniqueUserIds = new Set([...allPicIds, ...allCommenterIds]);

    // Hapus user yang membuat comment dari list notifikasi
    uniqueUserIds.delete(userId.toString());

    // Kirim notifikasi ke semua user yang relevan
    if (uniqueUserIds.size > 0) {
      for (const recipientId of uniqueUserIds) {
        await createCommentNotification({
          recipientId: recipientId,
          senderId: userId,
          subtaskId: subtask._id,
          subtaskName: subtask.nama,
          taskId: task._id,
          taskName: task.nama,
          workspaceId: task.workspace,
          projectId: group?.project,
          senderName: sender.username,
          commentText: text,
        });

        if (io) {
          io.to(`user:${recipientId}`).emit("notification:subtask-comment", {
            type: "SUBTASK_COMMENT",
            title: "New Comment on Subtask",
            message: `${sender.username} commented on "${
              subtask.nama
            }": "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`,
            subtaskId: subtask._id,
            subtaskName: subtask.nama,
            taskId: task._id,
            taskName: task.nama,
            commentId: comment._id,
            senderName: sender.username,
            senderId: userId,
            workspaceId: task.workspace,
            projectId: group?.project,
            timestamp: new Date(),
          });
        }
      }
    }

    if (io) {
      // Populate comment dengan user info untuk ditampilkan
      const populatedComment = await SubtaskComment.findById(
        comment._id
      ).populate("user", "username email");

      io.to(`subtask:${subtaskId}`).emit("subtask-comment:created", {
        subtaskId: subtask._id,
        comment: populatedComment,
        timestamp: new Date(),
      });
    }

    return res.status(201).json({
      success: true,
      message: "Comment created",
      data: comment,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function replySubtaskComment(req, res) {
  try {
    const { subtaskId, commentId } = req.params;
    const { text } = req.body;
    const userId = req.user._id;

    const parent = await SubtaskComment.findById(commentId).populate("user");
    if (!parent) {
      return res.status(404).json({
        success: false,
        message: "Parent comment tidak ada",
      });
    }

    const subtask = await Subtask.findById(subtaskId)
      .populate("task")
      .populate("pic", "username email");
    if (!subtask) {
      return res.status(404).json({
        success: false,
        message: "Subtask tidak ditemukan",
      });
    }

    const task = await Task.findById(subtask.task);
    const group = await Group.findById(task.groups);
    const reply = await SubtaskComment.create({
      subtask: subtaskId,
      user: userId,
      text,
      parentComment: parent._id,
      depth: parent.depth + 1,
    });

    const sender = await User.findById(userId).select("username email");

    await createActivity({
      user: userId,
      workspace: task.workspace,
      project: group?.project,
      group: group?._id,
      task: task._id,
      action: "REPLY_SUBTASK_COMMENT",
      description: `User replied to comment on subtask ${subtask.nama}`,
      before: {},
      after: {
        text: reply.text,
        replyId: reply._id,
        parentCommentId: parent._id,
        subtaskId: subtask._id,
      },
    });

    // Get io instance from app
    const io = req.app.get("io");

    // Cari semua user yang pernah komentar di subtask ini
    const allCommenters = await SubtaskComment.find({ subtask: subtaskId })
      .distinct("user")
      .lean();

    // Gabungkan PIC dan commenters
    const allPicIds = subtask.pic.map((pic) => pic._id.toString());
    const allCommenterIds = allCommenters.map((commenter) =>
      commenter.toString()
    );

    // Gabungkan semua user yang perlu dikirim notifikasi
    const uniqueUserIds = new Set([...allPicIds, ...allCommenterIds]);

    // Hapus user yang membuat reply dari list notifikasi
    uniqueUserIds.delete(userId.toString());

    // Kirim notifikasi ke semua user yang relevan
    if (uniqueUserIds.size > 0) {
      for (const recipientId of uniqueUserIds) {
        // Tentukan apakah recipient adalah pemilik parent comment
        const isParentCommenter = recipientId === parent.user._id.toString();

        if (isParentCommenter) {
          // Notifikasi khusus untuk pemilik parent comment
          await createReplyCommentNotification({
            recipientId: recipientId,
            senderId: userId,
            subtaskId: subtask._id,
            subtaskName: subtask.nama,
            taskId: task._id,
            taskName: task.nama,
            workspaceId: task.workspace,
            projectId: group?.project,
            senderName: sender.username,
            replyText: text,
            parentCommentId: parent._id,
          });

          if (io) {
            io.to(`user:${recipientId}`).emit("notification:subtask-reply", {
              type: "SUBTASK_REPLY_COMMENT",
              title: "New Reply on Your Comment",
              message: `${sender.username} replied to your comment on "${
                subtask.nama
              }": "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`,
              subtaskId: subtask._id,
              subtaskName: subtask.nama,
              taskId: task._id,
              taskName: task.nama,
              replyId: reply._id,
              parentCommentId: parent._id,
              senderName: sender.username,
              senderId: userId,
              workspaceId: task.workspace,
              projectId: group?.project,
              timestamp: new Date(),
            });
          }
        } else {
          // Notifikasi umum untuk user lain
          await createCommentNotification({
            recipientId: recipientId,
            senderId: userId,
            subtaskId: subtask._id,
            subtaskName: subtask.nama,
            taskId: task._id,
            taskName: task.nama,
            workspaceId: task.workspace,
            projectId: group?.project,
            senderName: sender.username,
            commentText: text,
          });

          if (io) {
            io.to(`user:${recipientId}`).emit("notification:subtask-comment", {
              type: "SUBTASK_COMMENT",
              title: "New Reply on Subtask",
              message: `${sender.username} replied to a comment on "${
                subtask.nama
              }": "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`,
              subtaskId: subtask._id,
              subtaskName: subtask.nama,
              taskId: task._id,
              taskName: task.nama,
              commentId: reply._id,
              senderName: sender.username,
              senderId: userId,
              workspaceId: task.workspace,
              projectId: group?.project,
              timestamp: new Date(),
            });
          }
        }
      }
    }

    if (io) {
      const populatedReply = await SubtaskComment.findById(reply._id).populate(
        "user",
        "username email"
      );

      io.to(`subtask:${subtaskId}`).emit("subtask-reply:created", {
        subtaskId: subtask._id,
        reply: populatedReply,
        parentCommentId: parent._id,
        timestamp: new Date(),
      });
    }

    return res.status(201).json({
      success: true,
      message: "Reply created",
      data: reply,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export const getSubtaskComments = async (req, res) => {
  try {
    const { subtaskId } = req.params;

    let comments = await SubtaskComment.find({ subtask: subtaskId })
      .populate("user", "username email")
      .sort({ createdAt: 1 });

    let map = {};
    comments = comments.map((c) => {
      const obj = c.toObject();
      obj.replies = [];
      map[c._id] = obj;
      return obj;
    });

    const roots = [];

    comments.forEach((c) => {
      if (c.parentComment) {
        map[c.parentComment]?.replies.push(c);
      } else {
        roots.push(c);
      }
    });

    return res.status(200).json({
      success: true,
      data: roots,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export async function deleteSubtaskComment(req, res) {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;

    const comment = await SubtaskComment.findById(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment tidak ditemukan",
      });
    }

    // Verifikasi bahwa user adalah pembuat comment
    if (comment.user.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki izin untuk menghapus comment ini",
      });
    }

    // Hapus comment dan semua replies-nya
    await SubtaskComment.deleteMany({
      $or: [{ _id: commentId }, { parentComment: commentId }],
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`subtask:${comment.subtask}`).emit("subtask-comment:deleted", {
        commentId: commentId,
        timestamp: new Date(),
      });
    }

    return res.status(200).json({
      success: true,
      message: "Comment deleted successfully",
    });
  } catch (error) {
    return handleError(res, error);
  }
}
