// Server.js - Fixed version
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import connectDB from "./config/database.js";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "path";
import workspaceRoutes from "./routes/workspaceRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import subTaskRoutes from "./routes/subTaskRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import collaboratRoutes from "./routes/collaboratRoutes.js";
import kuarterRoutes from "./routes/kuarterRoutes.js";
import commentRoutes from "./routes/commentRoutes.js";
import attachmentRoutes from "./routes/attachmentRoutes.js";
import progresRoutes from "./routes/progresRoutes.js";
import ganchartRoutes from "./routes/ganchartRoutes.js";
import memberRoutes from "./routes/memberRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import agendaRoutes from "./routes/agendaRoutes.js";
import cors from "cors";
import notificationRoutes from "./routes/notificationRoutes.js";
import { initializeSocket } from "./sockets/socketHandler.js";
import {
  startTaskDueNotificationJob,
  startTaskOverdueNotificationJob,
} from "./jobs/taskDueNotification.js";

dotenv.config({ debug: true, override: true });

const app = express();
const httpServer = createServer(app);

// Socket.IO configuration
const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      process.env.CLIENT_URL,
    ].filter(Boolean), // Remove undefined values
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"], // Explicitly set transports
  allowEIO3: true, // Enable compatibility with Engine.IO v3 clients
});

const PORT = process.env.PORT || 5000;

// Connect to database
connectDB();

// CORS configuration
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      process.env.CLIENT_URL,
    ].filter(Boolean),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Middleware
app.use(morgan("combined"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Make io accessible to routes
app.set("io", io);

// Routes
app.use("/api/", authRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/project", projectRoutes);
app.use("/api/group", groupRoutes);
app.use("/api/task", taskRoutes);
app.use("/api/subTask", subTaskRoutes);
app.use("/api/users", userRoutes);
app.use("/api/collaboration", collaboratRoutes);
app.use("/api/kuarter", kuarterRoutes);
app.use("/api/comment", commentRoutes);
app.use("/api/attachment", attachmentRoutes);
app.use("/api/progress", progresRoutes);
app.use("/api/ganchart", ganchartRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/agenda", agendaRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    socketio: {
      connected: io.engine.clientsCount,
    },
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Global Error:", error);
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
});

// Initialize Socket.IO handlers
initializeSocket(io);

// Start server
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Server running in ${
      process.env.NODE_ENV || "development"
    } mode on port ${PORT}`
  );
  console.log(`Socket.IO server is ready for connections`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  httpServer.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});
startTaskDueNotificationJob(io);
startTaskOverdueNotificationJob(io);
export default app;
export { io };
