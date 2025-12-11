import express from "express";
import {
  createProject,
  getProject,
  updateProject,
  deleteProject,
  getProjectById,
} from "../controllers/projectsController.js";
import {
  authenticate,
  requireSystemAdmin,
  checkWorkspaceRole,
  checkWorkspaceRoleFromProject,
} from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, getProject);
router.post(
  "/:workspaceId",
  authenticate,
  // checkWorkspaceRole(["admin", "project_manager"]),
  createProject
);
router.get("/:projectId", authenticate, getProjectById);
router.put(
  "/:projectId",
  authenticate,
  checkWorkspaceRoleFromProject(["admin", "project_manager"]),
  updateProject
);
router.delete(
  "/:projectId",
  authenticate,
  checkWorkspaceRoleFromProject(["admin", "project_manager"]),
  deleteProject
);

export default router;
