import express from "express";
import {
  createProject,
  getProject,
  updateProject,
  deleteProject,
  getProjectById,
  getProjectList,
} from "../controllers/projectsController.js";
import {
  addProjectParty,
  updateProjectParty,
  deleteProjectParty,
} from "../controllers/projectPartyController.js";
import {
  authenticate,
  requireSystemAdmin,
  checkWorkspaceRole,
  checkWorkspaceRoleFromProject,
} from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, getProject);
router.get("/project-list", authenticate, getProjectList);
router.post(
  "/",
  authenticate,
  // checkWorkspaceRole(["admin", "project_manager"]),
  createProject,
);
router.post("/:projectId/parties", authenticate, addProjectParty);
router.patch(
  "/:projectId/parties/:projectPartyId",
  authenticate,
  updateProjectParty,
);
router.delete(
  "/:projectId/parties/:projectPartyId",
  authenticate,
  deleteProjectParty,
);
router.get("/:projectId", authenticate, getProjectById);
router.patch(
  "/:projectId",
  authenticate,
  // checkWorkspaceRoleFromProject(["admin", "project_manager"]),
  updateProject,
);
router.put(
  "/:projectId",
  authenticate,
  // checkWorkspaceRoleFromProject(["admin", "project_manager"]),
  updateProject,
);
router.delete(
  "/:projectId",
  authenticate,
  // checkWorkspaceRoleFromProject(["admin", "project_manager"]),
  deleteProject,
);

export default router;
