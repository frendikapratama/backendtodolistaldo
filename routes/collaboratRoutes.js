import express from "express";
import {
  sendCollaborationRequest,
  approveCollaboration,
  rejectCollaboration,
  getCollaborationRequests,
  getWorkspaceProjects,
} from "../controllers/collaborationController.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

router.post("/send", sendCollaborationRequest);
router.get("/", getCollaborationRequests);
router.put("/:requestId/approve", approveCollaboration);
router.put("/:requestId/reject", rejectCollaboration);
router.get("/workspace/:workspaceId/projects", getWorkspaceProjects);

export default router;
