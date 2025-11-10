import express from "express";
import connectDB from "./config/database.js";
import morgan from "morgan";
import dotenv from "dotenv";
import workspaceRoutes from "./routes/workspaceRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import subTaskRoutes from "./routes/subTaskRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import collaboratRoutes from "./routes/collaboratRoutes.js";
import kuarterRoutes from "./routes/kuarterRoutes.js";

import cors from "cors";
dotenv.config({ debug: true, override: true });

const app = express();
const PORT = process.env.PORT || 5000;
connectDB();
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    imgSrc: ["'self'", "data:", "https:", "http:"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.use(morgan("combined"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/", authRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/project", projectRoutes);
app.use("/api/group", groupRoutes);
app.use("/api/task", taskRoutes);
app.use("/api/subTask", subTaskRoutes);
app.use("/api/users", userRoutes);
app.use("/api/collaboration", collaboratRoutes);
app.use("/api/kuarter", kuarterRoutes);

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
// app.use((req, res) => {
//   res.status(404).json({
//     success: false,
//     message: "Route not found",
//   });
// });

// Global error handler
app.use((error, req, res, next) => {
  console.error("Global Error:", error);
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
export default app;
