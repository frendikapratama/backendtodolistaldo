// routes/attachmentRoutes.js
import express from "express";
import { uploadSingle } from "../middleware/upload.js";

import { uploadErrorHandler } from "../middleware/uploadErrorHandler.js";
import {
  addAttachment,
  getTaskAttachments,
  downloadAttachment,
  deleteAttachment,
  addSubtaskAttachment,
  deleteSubtaskAttachment,
  getSubtaskAttachments,
  downloadSubtaskAttachment,
} from "../controllers/attachmentController.js";
import { authenticate } from "../middleware/auth.js";
const router = express.Router();

// task
router.post(
  "/:taskId",
  authenticate,
  uploadSingle,
  uploadErrorHandler,
  addAttachment,
);

router.get("/:taskId", authenticate, getTaskAttachments);

router.get("/:taskId/download/:attachmentId", authenticate, downloadAttachment);

router.delete("/:taskId/delete/:attachmentId", authenticate, deleteAttachment);

// subtask
router.post(
  "/subtask/:subTaskId",
  authenticate,
  uploadSingle,
  uploadErrorHandler,
  addSubtaskAttachment,
);

router.get("/subtask/:subTaskId", authenticate, getSubtaskAttachments);

router.get(
  "/subtask/:subTaskId/:attachmentId/download",
  authenticate,
  downloadSubtaskAttachment,
);

router.delete(
  "/subtask/:subTaskId/delete/:attachmentId",
  authenticate,
  deleteSubtaskAttachment,
);
export default router;
