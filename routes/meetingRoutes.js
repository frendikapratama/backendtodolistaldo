import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import {
  checkAvailability,
  createMeeting,
  getMeeting,
  updateMeeting,
  rescheduleMeeting,
  cancelMeeting,
  getMeetingParticipants,
  getDashboardData,
  getMeetingDetail,
  addMeetingResult,
  deleteMeetingResult,
  updateMeetingResult,
  handleRSVP,
  endMeeting,
  getMeetingTodayByUserLogin,
  getMeetingToday,
} from "../controllers/meetingController.js";
import { authenticate } from "../middleware/auth.js";

const meetingUploadsDir = path.join(
  process.cwd(),
  "uploads",
  "meeting-results",
);
if (!fs.existsSync(meetingUploadsDir)) {
  fs.mkdirSync(meetingUploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, meetingUploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, "meeting-" + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "image/jpeg",
      "image/png",
      "image/gif",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "File type not allowed. Allowed: PDF, Word, Excel, PowerPoint, Text, Images",
        ),
      );
    }
  },
});

const router = express.Router();

router.get("/dashboard", getDashboardData);
router.post("/check-availability", checkAvailability);
router.post("/", createMeeting);
router.get("/", getMeeting);
router.get("/:id/participants", getMeetingParticipants);
router.put("/:id", updateMeeting);
router.patch("/:id/reschedule", rescheduleMeeting);
router.patch("/:id/cancel", cancelMeeting);
router.get("/:id/detail", getMeetingDetail);
router.post("/:id/results", upload.single("file"), addMeetingResult);
router.put("/:id/results/:resultId", updateMeetingResult);
router.delete("/:id/results/:resultId", deleteMeetingResult);
router.get("/rsvp/:token", handleRSVP);
router.patch("/:id/end", endMeeting);
router.get("/today", authenticate, getMeetingTodayByUserLogin);
router.get("/all/today", getMeetingToday);
export default router;
