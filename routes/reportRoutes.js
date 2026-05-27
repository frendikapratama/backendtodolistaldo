

import express from "express";
import {
getTaskReports
} from "../controllers/reportController.js";
const router = express.Router();

router.get("/tasks", getTaskReports);

export default router;