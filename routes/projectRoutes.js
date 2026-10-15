import express from "express";
import {
  createProject,
  getProject,
  updateProject,
  deleteProject,
  getProjectById,
} from "../controllers/projectsController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, getProject);
router.post("/", authenticate, createProject);
router.post("/:workspaceId", authenticate, createProject);
router.get("/:projectId", authenticate, getProjectById);
router.put("/:projectId", authenticate, updateProject);
router.delete("/:projectId", authenticate, deleteProject);

export default router;
