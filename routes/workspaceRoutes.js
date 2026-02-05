import express from "express";
import {
  createWorkspace,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getWorkspaceById,
  inviteMemberByEmail,
  updateMemberRole,
  removeMember,
  verifyWorkspaceInvite,
  acceptWorkspaceInvite,
  getMyworkspace,
} from "../controllers/workspaceController.js";
import {
  authenticate,
  checkWorkspaceRole,
  requireSystemAdmin,
} from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, getWorkspace);
router.get("/me", authenticate, getMyworkspace);
router.post("/:kuarterId", authenticate, requireSystemAdmin, createWorkspace);

router.get("/:workspaceId/verify-invite", verifyWorkspaceInvite);
router.post("/:workspaceId/accept-invite", acceptWorkspaceInvite);

router.get("/:workspaceId", authenticate, getWorkspaceById);

router.put(
  "/:workspaceId",
  authenticate,
  checkWorkspaceRole(["admin", "project_manager"]),
  updateWorkspace,
);

router.delete(
  "/:workspaceId",
  authenticate,
  requireSystemAdmin,
  deleteWorkspace,
);

router.post(
  "/:workspaceId/invite",
  authenticate,
  checkWorkspaceRole(["admin", "project_manager"]),
  inviteMemberByEmail,
);

router.put(
  "/:workspaceId/members/:userId/role",
  authenticate,
  checkWorkspaceRole(["admin"]),
  updateMemberRole,
);

router.delete(
  "/:workspaceId/members/:userId",
  authenticate,
  checkWorkspaceRole(["admin"]),
  removeMember,
);

export default router;
