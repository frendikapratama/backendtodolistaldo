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
  getMajorTasksByProject,
  getMyTasksWithMeetings,
  getProjectsWithMajorTask,
} from "../controllers/taksController.js";
import {
  authenticate,
  checkWorkspaceRoleFromTask,
  checkWorkspaceRoleFromGroup,
  checkTaskTypeAccess,
} from "../middleware/auth.js";
const router = express.Router();

router.get("/", authenticate, getTask);
router.get("/my-work", authenticate, getMyTasks);
router.get("/my-work-agenda-meeting", authenticate, getMyTasksWithMeetings);
router.get("/ByGroup", authenticate, getTasksByGroup);
router.post(
  "/:groupId",
  authenticate,
  checkWorkspaceRoleFromGroup([
    "admin",
    "project_manager",
    "member",
    "management",
  ]),
  createTask,
);
router.put(
  "/positions/:groupId",
  authenticate,
  checkWorkspaceRoleFromGroup([
    "admin",
    "project_manager",
    "member",
    "management",
  ]),
  updateTaskPositions,
);
router.put(
  "/:taskId",
  authenticate,
  checkTaskTypeAccess(),
  checkWorkspaceRoleFromTask([
    "admin",
    "project_manager",
    "member",
    "management",
  ]),
  updateTask,
);
router.delete(
  "/:taskId",
  authenticate,
  checkTaskTypeAccess(),
  checkWorkspaceRoleFromTask(["admin", "project_manager", "management"]),
  deleteTask,
);
router.delete(
  "/:taskId/pic",
  authenticate,
  checkTaskTypeAccess(),
  checkWorkspaceRoleFromTask(["admin", "project_manager", "management"]),
  removePic,
);
router.delete(
  "/:taskId/pic/all",
  authenticate,
  checkTaskTypeAccess(),
  checkWorkspaceRoleFromTask(["admin", "project_manager", "management"]),
  removeAllPics,
);
router.post("/:taskId/accept-pic-invite", acceptPicInvite);
router.get("/:taskId/verify-invite", verifyPicInvite);
router.get("/:projectId", getTasksByProjectSimple);
router.get("/major/:projectId/tasks", getMajorTasksByProject);
router.get("/major/projects", getProjectsWithMajorTask);

// Attachment routes
// router.post(
//   "/:taskId/attachments",
//   authenticate,
//   upload.single("file"),
//   uploadAttachment
// );

// Meeting link route
export default router;
