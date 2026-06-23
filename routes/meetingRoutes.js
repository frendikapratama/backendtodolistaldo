import express from "express";

import {
  checkAvailability,
  createMeeting,
  getMeeting,
  updateMeeting,
  rescheduleMeeting,
  cancelMeeting,
} from "../controllers/meetingController.js";

const router = express.Router();

router.post("/check-availability", checkAvailability);

router.post("/", createMeeting);

router.get("/", getMeeting);

router.put("/:id", updateMeeting);

router.patch("/:id/reschedule", rescheduleMeeting);

router.patch("/:id/cancel", cancelMeeting);

export default router;
