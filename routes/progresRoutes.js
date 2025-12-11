import express from "express";
import {
  getProgresByProject,
  getProgresByGroup,
  getProgresByWorkspace,
  getProgresByKuarter,
  getAllKuarterWithProgress,
} from "../controllers/progresController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/kuarter/all", getAllKuarterWithProgress);
router.get("/project/:projectId", authenticate, getProgresByProject);
router.get("/group/:groupId", authenticate, getProgresByGroup);
router.get("/workspace/:workspaceId", getProgresByWorkspace);
router.get("/kuarter/:kuarterId", getProgresByKuarter);

export default router;
