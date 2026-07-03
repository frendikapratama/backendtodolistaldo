import express from "express";
import { getMySchedule } from "../controllers/scheduleController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/my-schedule", authenticate, getMySchedule);
export default router;
