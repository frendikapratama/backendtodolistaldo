// routes/chatRoutes.js
import express from "express";
import { authenticate } from "../middleware/auth.js";
import {
  getWorkspaceMessages,
  uploadChatFile,
  deleteMessage,
  getUnreadCount,
} from "../controllers/chatController.js";
import multer from "multer";
import path from "path";
import fs from "fs"; // Tambahkan ini

const router = express.Router();

// Buat folder uploads/chat jika belum ada
const uploadDir = "uploads/chat/";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer config untuk file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip|rar/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Invalid file type"));
  },
});

// Get workspace chat history
router.get("/workspace/:workspaceId", authenticate, getWorkspaceMessages);
router.delete("/:messageId", authenticate, deleteMessage);
router.get("/workspace/:workspaceId/unread", authenticate, getUnreadCount);
// Upload file for chat
router.post(
  "/upload/:workspaceId",
  authenticate,
  upload.single("file"),
  uploadChatFile
);

export default router;
