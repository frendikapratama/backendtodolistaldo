import jwt from "jsonwebtoken";
import Workspace from "../models/Workspace.js";
import ChatMessage from "../models/Chat.js";
import User from "../models/User.js";

// Store active connections
const userSockets = new Map();
const socketUsers = new Map();
const workspaceRooms = new Map();

const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.token;

    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    const SECRET =
      process.env.TOKEN_SECRET ||
      process.env.JWT_SECRET ||
      "48db792b7ced19872b7109589afb94bb084acf4b5ef0879ccc5855395cb44a5e";

    const decoded = jwt.verify(token, SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return next(new Error("Authentication error: User not found"));
    }

    socket.userId = user._id.toString();
    socket.user = user;
    next();
  } catch (error) {
    console.error("Socket authentication error:", error);
    console.error(
      "Token:",
      socket.handshake.auth.token?.substring(0, 20) + "..."
    );
    next(new Error("Authentication error: Invalid token"));
  }
};

const isWorkspaceMember = async (userId, workspaceId) => {
  try {
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) return false;

    if (workspace.owner.toString() === userId) return true;

    return workspace.members.some(
      (member) => member.user.toString() === userId
    );
  } catch (error) {
    console.error("Error checking workspace membership:", error);
    return false;
  }
};

export const initializeSocket = (io) => {
  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    const userId = socket.userId;
    console.log(`User connected: ${userId} (${socket.id})`);

    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);
    socketUsers.set(socket.id, userId);

    socket.join(`user:${userId}`);

    socket.on("join:workspace", async (workspaceId) => {
      try {
        const isMember = await isWorkspaceMember(userId, workspaceId);

        if (!isMember) {
          socket.emit("error", {
            message: "You are not a member of this workspace",
          });
          return;
        }

        socket.join(`workspace:${workspaceId}`);

        if (!workspaceRooms.has(workspaceId)) {
          workspaceRooms.set(workspaceId, new Set());
        }
        workspaceRooms.get(workspaceId).add(socket.id);

        socket.emit("joined:workspace", { workspaceId });

        socket.to(`workspace:${workspaceId}`).emit("user:joined", {
          userId,
          username: socket.user.username,
        });

        console.log(`User ${userId} joined workspace ${workspaceId}`);
      } catch (error) {
        console.error("Error joining workspace:", error);
        socket.emit("error", { message: "Failed to join workspace" });
      }
    });

    socket.on("leave:workspace", (workspaceId) => {
      socket.leave(`workspace:${workspaceId}`);

      if (workspaceRooms.has(workspaceId)) {
        workspaceRooms.get(workspaceId).delete(socket.id);
      }

      socket.to(`workspace:${workspaceId}`).emit("user:left", {
        userId,
        username: socket.user.username,
      });

      console.log(`User ${userId} left workspace ${workspaceId}`);
    });

    socket.on("chat:send", async (data) => {
      try {
        const { workspaceId, message, type = "text", fileUrl, fileName } = data;

        const isMember = await isWorkspaceMember(userId, workspaceId);
        if (!isMember) {
          socket.emit("error", { message: "Not authorized" });
          return;
        }

        const chatMessage = await ChatMessage.create({
          workspace: workspaceId,
          sender: userId,
          message,
          type,
          fileUrl,
          fileName,
        });

        await chatMessage.populate("sender", "username email avatar");

        const messageData = chatMessage.toObject();

        io.to(`workspace:${workspaceId}`).emit("chat:message", messageData);

        console.log(`Message sent in workspace ${workspaceId} by ${userId}`);
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    socket.on("chat:typing", ({ workspaceId, isTyping }) => {
      socket.to(`workspace:${workspaceId}`).emit("chat:typing", {
        userId,
        username: socket.user.username,
        isTyping,
      });
    });

    socket.on("chat:read", async ({ workspaceId, messageId }) => {
      try {
        const message = await ChatMessage.findById(messageId);
        if (!message) return;

        const alreadyRead = message.readBy.some(
          (read) => read.user.toString() === userId
        );

        if (!alreadyRead) {
          message.readBy.push({ user: userId, readAt: new Date() });
          await message.save();

          io.to(`workspace:${workspaceId}`).emit("chat:read", {
            messageId,
            userId,
            readAt: new Date(),
          });
        }
      } catch (error) {
        console.error("Error marking message as read:", error);
      }
    });

    socket.on("chat:edit", async ({ messageId, newMessage }) => {
      try {
        const message = await ChatMessage.findById(messageId);

        if (!message) {
          socket.emit("error", { message: "Message not found" });
          return;
        }

        if (message.sender.toString() !== userId) {
          socket.emit("error", { message: "Not authorized" });
          return;
        }

        message.message = newMessage;
        message.isEdited = true;
        await message.save();

        await message.populate("sender", "username email avatar");

        io.to(`workspace:${message.workspace}`).emit("chat:edited", {
          ...message.toObject(),
        });
      } catch (error) {
        console.error("Error editing message:", error);
        socket.emit("error", { message: "Failed to edit message" });
      }
    });

    socket.on("chat:delete", async ({ messageId }) => {
      try {
        const message = await ChatMessage.findById(messageId);

        if (!message) {
          socket.emit("error", { message: "Message not found" });
          return;
        }

        if (message.sender.toString() !== userId) {
          socket.emit("error", { message: "Not authorized" });
          return;
        }

        message.isDeleted = true;
        message.message = "Message deleted";
        await message.save();

        io.to(`workspace:${message.workspace}`).emit("chat:deleted", {
          messageId,
        });
      } catch (error) {
        console.error("Error deleting message:", error);
        socket.emit("error", { message: "Failed to delete message" });
      }
    });

    // ===== NOTIFICATION EVENTS =====

    // Mark notification as read
    socket.on("notification:read", async ({ notificationId }) => {
      try {
        const { markAsRead } = await import("../helpers/notificationHelper.js");
        const notification = await markAsRead(notificationId, userId);

        if (notification) {
          socket.emit("notification:marked-read", {
            notificationId,
            success: true,
          });
        }
      } catch (error) {
        console.error("Error marking notification as read:", error);
        socket.emit("error", {
          message: "Failed to mark notification as read",
        });
      }
    });

    // Mark all notifications as read
    socket.on("notification:read-all", async () => {
      try {
        const { markAllAsRead, getUnreadCount } = await import(
          "../helpers/notificationHelper.js"
        );
        await markAllAsRead(userId);
        const unreadCount = await getUnreadCount(userId);

        socket.emit("notification:all-marked-read", {
          success: true,
          unreadCount,
        });
      } catch (error) {
        console.error("Error marking all notifications as read:", error);
        socket.emit("error", {
          message: "Failed to mark all notifications as read",
        });
      }
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${userId} (${socket.id})`);

      if (userSockets.has(userId)) {
        userSockets.get(userId).delete(socket.id);
        if (userSockets.get(userId).size === 0) {
          userSockets.delete(userId);
        }
      }
      socketUsers.delete(socket.id);

      workspaceRooms.forEach((sockets, workspaceId) => {
        if (sockets.has(socket.id)) {
          sockets.delete(socket.id);
          socket.to(`workspace:${workspaceId}`).emit("user:left", {
            userId,
            username: socket.user.username,
          });
        }
      });
    });

    // task
    socket.on("task:join", (taskId) => {
      socket.join(`task:${taskId}`);
      console.log(`User ${socket.userId} joined task room: ${taskId}`);
    });

    // Leave task room when user closes DialogDetail
    socket.on("task:leave", (taskId) => {
      socket.leave(`task:${taskId}`);
      console.log(`User ${socket.userId} left task room: ${taskId}`);
    });
  });

  return io;
};

// Utility function untuk emit notification ke user tertentu
export const emitNotificationToUser = (io, userId, notification) => {
  io.to(`user:${userId}`).emit("notification:new", notification);
};

export { userSockets, socketUsers, workspaceRooms };
