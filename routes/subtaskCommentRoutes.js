import express from "express";
import {
  createSubtaskComment,
  replySubtaskComment,
  getSubtaskComments,
  deleteSubtaskComment,
} from "../controllers/SubtaskCommentController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);

// Create comment on subtask
router.post("/:subtaskId", authenticate, createSubtaskComment);

// Reply to comment on subtask
router.post("/:subtaskId/reply/:commentId", authenticate, replySubtaskComment);

// Get all comments for subtask
router.get("/:subtaskId", authenticate, getSubtaskComments);

// Delete comment
router.delete("/:commentId", authenticate, deleteSubtaskComment);

export default router;
