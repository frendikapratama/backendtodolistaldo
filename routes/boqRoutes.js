import express from "express";
import {
  getBOQByProject,
  getBOQSections,
  getBOQItemById,
  createBOQItem,
  updateBOQItem,
  updateBOQStatus,
  deleteBOQItem,
} from "../controllers/boqController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/project/:projectId", authenticate, getBOQByProject);
router.get("/project/:projectId/sections", authenticate, getBOQSections);
router.post("/project/:projectId", authenticate, createBOQItem);
router.get("/:id", authenticate, getBOQItemById);
router.put("/:id", authenticate, updateBOQItem);
router.patch("/:id/status", authenticate, updateBOQStatus);
router.delete("/:id", authenticate, deleteBOQItem);

export default router;
