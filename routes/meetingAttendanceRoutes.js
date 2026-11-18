import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authenticate } from "../middleware/auth.js";
import { checkIn, getAttendanceRecap } from "../controllers/meetingAttendanceController.js";

const uploadDir = path.join(process.cwd(), "uploads", "meeting-attendance");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `attendance-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});

const router = express.Router();
router.post("/:meetingId", authenticate, upload.single("photo"), checkIn);
router.get("/:meetingId/recap", authenticate, getAttendanceRecap);
export default router;
