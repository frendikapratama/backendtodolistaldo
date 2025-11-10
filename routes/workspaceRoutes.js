import express from "express";

import {
  createWorkspace,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getWorkspaceById,
  inviteMemberByEmail,
  acceptInvite,
} from "../controllers/workspaceController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/", getWorkspace);
router.post("/:kuarterId", authenticate, createWorkspace);
router.get("/:workspaceId", getWorkspaceById);
router.put("/:workspaceId", updateWorkspace);
router.delete("/:workspaceId", deleteWorkspace);
router.post("/:workspaceId/invite", authenticate, inviteMemberByEmail);
router.post("/invite/accept", authenticate, acceptInvite);

export default router;
