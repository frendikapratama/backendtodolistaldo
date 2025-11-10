import express from "express";
import {
  getSubTask,
  createSubTask,
  updateSubTask,
  deleteSubTask,
  positionSubTask,
  getByTask,
  acceptSubtaskPicInvite,
  removeSubtaskPic,
} from "../controllers/subTaskController.js";
import { authenticate } from "../middleware/auth.js";
const router = express.Router();

router.get("/", authenticate, getSubTask);
router.get("/ByTask", authenticate, getByTask);
router.patch("/:taskId", authenticate, positionSubTask);
router.post("/:taskId", authenticate, createSubTask);
router.put("/:subTaskId", authenticate, updateSubTask);
router.delete("/:subTaskId", authenticate, deleteSubTask);
router.post("/:subTaskId/accept-pic-invite", acceptSubtaskPicInvite);
router.delete("/:subTaskId/pic", authenticate, removeSubtaskPic);

export default router;
