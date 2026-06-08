import express from "express";
import {
  createComment,
  replyComment,
  getComments,
  deleteComment,
  editComment
} from "../controllers/CommentController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();
router.use(authenticate);
router.post("/:taskId", authenticate, createComment);

router.post("/:taskId/reply/:commentId", authenticate, replyComment);

router.get("/:taskId", authenticate, getComments);

router.delete("/:commentId", authenticate, deleteComment);
  
router.put("/:commentId", authenticate, editComment);

export default router;
