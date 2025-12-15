import Comment from "../models/Comment.js";
import { handleError } from "../utils/errorHandler.js";
import { createActivity } from "../helpers/activityhelper.js";
import {
  createCommentNotification,
  createReplyCommentNotification,
} from "../helpers/notificationHelper.js";
import Group from "../models/Group.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";

export async function createComment(req, res) {
  try {
    const { taskId } = req.params;
    const { text } = req.body;
    const userId = req.user._id;

    const task = await Task.findById(taskId)
      .populate("groups")
      .populate("pic", "username email");

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task tidak ditemukan",
      });
    }

    const comment = await Comment.create({
      task: taskId,
      user: userId,
      text,
      parentComment: null,
      depth: 0,
    });

    const group = await Group.findById(task.groups);
    const sender = await User.findById(userId).select("username email");

    await createActivity({
      user: userId,
      workspace: task.workspace,
      project: group?.project,
      group: group?._id,
      task: task._id,
      action: "COMMENT",
      description: `User commented on task ${task.nama}`,
      before: {},
      after: {
        text: comment.text,
        commentId: comment._id,
      },
    });

    // Get io instance from app
    const io = req.app.get("io");

    // Cari semua user yang pernah komentar di task ini
    const allCommenters = await Comment.find({ task: taskId })
      .distinct("user")
      .lean();

    // Gabungkan PIC dan commenters, pastikan tidak ada duplikat
    const allPicIds = task.pic.map((pic) => pic._id.toString());
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
          taskId: task._id,
          taskName: task.nama,
          workspaceId: task.workspace,
          projectId: group?.project,
          senderName: sender.username,
          commentText: text,
        });

        if (io) {
          io.to(`user:${recipientId}`).emit("notification:comment", {
            type: "TASK_COMMENT",
            title: "New Comment on Task",
            message: `${sender.username} commented on "${
              task.nama
            }": "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`,
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
      const populatedComment = await Comment.findById(comment._id).populate(
        "user",
        "username email"
      );

      io.to(`task:${taskId}`).emit("comment:created", {
        taskId: task._id,
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

export async function replyComment(req, res) {
  try {
    const { taskId, commentId } = req.params;
    const { text } = req.body;
    const userId = req.user._id;

    const parent = await Comment.findById(commentId).populate("user");
    if (!parent) {
      return res.status(404).json({
        success: false,
        message: "Parent comment tidak ada",
      });
    }

    const task = await Task.findById(taskId)
      .populate("groups")
      .populate("pic", "username email");
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task tidak ditemukan",
      });
    }
    const group = await Group.findById(task.groups);
    const reply = await Comment.create({
      task: taskId,
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
      action: "REPLY_COMMENT",
      description: `User replied to comment ${parent.text} on task ${task.nama}`,
      before: {},
      after: {
        text: reply.text,
        replyId: reply._id,
        parentCommentId: parent._id,
        groups: group?._id,
      },
    });

    // Get io instance from app
    const io = req.app.get("io");

    // Cari semua user yang pernah komentar di task ini (termasuk pemilik parent comment)
    const allCommenters = await Comment.find({ task: taskId })
      .distinct("user")
      .lean();

    // Gabungkan PIC dan commenters
    const allPicIds = task.pic.map((pic) => pic._id.toString());
    const allCommenterIds = allCommenters.map((commenter) =>
      commenter.toString()
    );

    // Gabungkan semua user yang perlu dikirim notifikasi
    const uniqueUserIds = new Set([...allPicIds, ...allCommenterIds]);

    // Pastikan pemilik parent comment tetap mendapat notifikasi khusus
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
            taskId: task._id,
            taskName: task.nama,
            workspaceId: task.workspace,
            projectId: group?.project,
            senderName: sender.username,
            replyText: text,
            parentCommentId: parent._id,
          });

          if (io) {
            io.to(`user:${recipientId}`).emit("notification:reply", {
              type: "TASK_REPLY_COMMENT",
              title: "New Reply on Your Comment",
              message: `${sender.username} replied to your comment on "${
                task.nama
              }": "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`,
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
            taskId: task._id,
            taskName: task.nama,
            workspaceId: task.workspace,
            projectId: group?.project,
            senderName: sender.username,
            commentText: text,
          });

          if (io) {
            io.to(`user:${recipientId}`).emit("notification:comment", {
              type: "TASK_COMMENT",
              title: "New Reply on Task",
              message: `${sender.username} replied to a comment on "${
                task.nama
              }": "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`,
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
      const populatedReply = await Comment.findById(reply._id).populate(
        "user",
        "username email"
      );

      io.to(`task:${taskId}`).emit("reply:created", {
        taskId: task._id,
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

export const getComments = async (req, res) => {
  try {
    const { taskId } = req.params;

    let comments = await Comment.find({ task: taskId })
      .populate("user", "username ")
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

export async function deleteComment(req, res) {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;

    const comment = await Comment.findById(commentId).populate("task");
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

    const taskId = comment.task._id;

    // Hapus comment dan semua replies-nya
    await Comment.deleteMany({
      $or: [{ _id: commentId }, { parentComment: commentId }],
    });

    // Hapus semua notification yang terkait dengan comment ini
    await Notification.deleteMany({
      task: taskId,
      type: { $in: ["TASK_COMMENT", "TASK_REPLY_COMMENT"] },
    });

    // Broadcast socket event ke semua user yang terhubung ke task ini
    const io = req.app.get("io");
    if (io) {
      io.to(`task:${taskId}`).emit("comment:deleted", {
        commentId: commentId,
        taskId: taskId,
        timestamp: new Date(),
      });
    }

    return res.status(200).json({
      success: true,
      message: "Comment dan notifikasi berhasil dihapus",
    });
  } catch (error) {
    return handleError(res, error);
  }
}
