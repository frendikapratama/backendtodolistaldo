import express from "express";
import {
  createSubtaskComment,
  replySubtaskComment,
  getSubtaskComments,
  deleteSubtaskComment,
  editSubtaskComment
} from "../controllers/SubtaskCommentController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);

router.post("/:subtaskId", authenticate, createSubtaskComment);
router.post("/:subtaskId/reply/:commentId", authenticate, replySubtaskComment);
router.get("/:subtaskId", authenticate, getSubtaskComments);
router.delete("/:commentId", authenticate, deleteSubtaskComment);
router.put("/:commentId", editSubtaskComment);

export default router;
