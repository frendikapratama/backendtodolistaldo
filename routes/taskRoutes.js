import express from "express";
import {
  createTask,
  getTask,
  updateTask,
  deleteTask,
  getTasksByGroup,
  updateTaskPositions,
  acceptPicInvite,
  removePic,
  removeAllPics,
  verifyPicInvite,
  getTasksByProjectSimple,
  getMyTasks,
  getMyTasksWithMeetings,
} from "../controllers/taksController.js";
import {
  authenticate,
  checkWorkspaceRoleFromTask,
  checkWorkspaceRoleFromGroup,
} from "../middleware/auth.js";
const router = express.Router();

router.get("/", authenticate, getTask);
router.get("/my-work", authenticate, getMyTasks);
router.get("/my-work-agenda-meeting", authenticate, getMyTasksWithMeetings);
router.get("/ByGroup", authenticate, getTasksByGroup);
router.post(
  "/:groupId",
  authenticate,
  checkWorkspaceRoleFromGroup(["admin", "project_manager", "member"]),
  createTask
);
router.put(
  "/positions/:groupId",
  authenticate,
  checkWorkspaceRoleFromGroup(["admin", "project_manager", "member"]),
  updateTaskPositions
);
router.put(
  "/:taskId",
  authenticate,
  checkWorkspaceRoleFromTask(["admin", "project_manager", "member"]),
  updateTask
);
router.delete(
  "/:taskId",
  authenticate,
  checkWorkspaceRoleFromTask(["admin", "project_manager"]),
  deleteTask
);
router.delete(
  "/:taskId/pic",
  authenticate,
  checkWorkspaceRoleFromTask(["admin", "project_manager"]),
  removePic
);
router.delete(
  "/:taskId/pic/all",
  authenticate,
  checkWorkspaceRoleFromTask(["admin", "project_manager"]),
  removeAllPics
);
router.post("/:taskId/accept-pic-invite", acceptPicInvite);
router.get("/:taskId/verify-invite", verifyPicInvite);
router.get("/:projectId", getTasksByProjectSimple);
// Attachment routes
// router.post(
//   "/:taskId/attachments",
//   authenticate,
//   upload.single("file"),
//   uploadAttachment
// );

// Meeting link route
export default router;
