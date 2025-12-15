import express from "express";
import {
  createComment,
  replyComment,
  getComments,
  deleteComment,
} from "../controllers/CommentController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();
router.use(authenticate);
router.post("/:taskId", authenticate, createComment);

router.post("/:taskId/reply/:commentId", authenticate, replyComment);

router.get("/:taskId", authenticate, getComments);

router.delete("/:commentId", authenticate, deleteComment);

export default router;
