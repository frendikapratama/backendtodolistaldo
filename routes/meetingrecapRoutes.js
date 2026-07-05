import express from "express";

import {
  getRecapSummary,
  getMeetingResultsList,
} from "../controllers/meetingrecapController.js";

const router = express.Router();

router.get("/summary", getRecapSummary);
router.get("/results", getMeetingResultsList);

export default router;
