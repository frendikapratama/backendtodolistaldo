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
  verifySubtaskPicInvite,
} from "../controllers/subTaskController.js";
import {
  authenticate,
  checkWorkspaceRoleFromSubtask,
  checkWorkspaceRoleFromTask,
  checkSubtaskTypeAccess,
} from "../middleware/auth.js";
const router = express.Router();

router.get("/", authenticate, getSubTask);
router.get("/ByTask", authenticate, getByTask);
router.patch(
  "/:taskId",
  authenticate,
  checkWorkspaceRoleFromTask(["admin", "project_manager", "member", "management"]),
  positionSubTask
);
router.post(
  "/:taskId",
  authenticate,
  checkWorkspaceRoleFromTask(["admin", "project_manager", "member", "management"]),
  createSubTask
);
router.put(
  "/:subTaskId",
  authenticate,
  checkWorkspaceRoleFromSubtask(["admin", "project_manager", "member", "management"]),
  checkSubtaskTypeAccess("edit"),
  updateSubTask
);
router.delete(
  "/:subTaskId",
  authenticate,
  checkWorkspaceRoleFromSubtask(["admin", "project_manager", "member", "management"]),
  checkSubtaskTypeAccess("edit"),
  deleteSubTask
);

router.delete(
  "/:subTaskId/pic",
  authenticate,
  checkWorkspaceRoleFromSubtask(["admin", "project_manager", "member", "management"]),
  removeSubtaskPic
);
router.post("/:subTaskId/accept-pic-invite", acceptSubtaskPicInvite);
router.get("/:subTaskId/verify-invite", verifySubtaskPicInvite);
export default router;
