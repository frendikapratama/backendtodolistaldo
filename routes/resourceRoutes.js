import express from "express";
import { authenticate, checkWorkspaceRoleFromProject } from "../middleware/auth.js";
import {
  listResources,
  getResource,
  createResource,
  updateResource,
  deleteResource,
  listProjectResourcePlanning,
  createResourcePlanning,
  updateResourcePlanning,
  deleteResourcePlanning,
} from "../controllers/resourceController.js";

const router = express.Router();

router.get("/", authenticate, listResources);
router.post("/", authenticate, createResource);
router.get("/planning/project/:projectId", authenticate, checkWorkspaceRoleFromProject(), listProjectResourcePlanning);
const canManageProjectResources = checkWorkspaceRoleFromProject(["admin", "project_manager", "member", "management"]);
router.post("/planning/project/:projectId", authenticate, canManageProjectResources, createResourcePlanning);
router.put("/planning/project/:projectId/:planId", authenticate, canManageProjectResources, updateResourcePlanning);
router.delete("/planning/project/:projectId/:planId", authenticate, canManageProjectResources, deleteResourcePlanning);
router.get("/:id", authenticate, getResource);
router.put("/:id", authenticate, updateResource);
router.delete("/:id", authenticate, deleteResource);

export default router;
