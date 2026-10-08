import express from "express";
import {
  getCostsByProject,
  getCostById,
  createCost,
  updateCost,
  updateCostStatus,
  deleteCost,
  createCostsFromBidding,
} from "../controllers/costController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/project/:projectId", authenticate, getCostsByProject);
router.post("/", authenticate, createCost);
router.post("/from-bidding/:biddingId", authenticate, createCostsFromBidding);
router.get("/:id", authenticate, getCostById);
router.put("/:id", authenticate, updateCost);
router.patch("/:id/status", authenticate, updateCostStatus);
router.delete("/:id", authenticate, deleteCost);

export default router;
