import express from "express";

import {
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  updateGroupPositions,
} from "../controllers/groupController.js";
import {
  authenticate,
  checkWorkspaceRoleFromGroup,
  checkWorkspaceRoleFromProject,
} from "../middleware/auth.js";
const router = express.Router();

router.get("/", authenticate, getGroup);
router.post(
  "/:projectId",
  authenticate,
  checkWorkspaceRoleFromProject(["project_manager", "admin", "member"]),
  createGroup
);
router.put(
  "/:projectId/positions",
  authenticate,
  checkWorkspaceRoleFromProject(["project_manager", "admin", "member"]),
  updateGroupPositions
);
router.put(
  "/:groupId",
  authenticate,
  checkWorkspaceRoleFromGroup([]),
  updateGroup
);
router.delete(
  "/:groupId",
  authenticate,
  checkWorkspaceRoleFromGroup(["project_manager", "admin"]),
  deleteGroup
);

export default router;
