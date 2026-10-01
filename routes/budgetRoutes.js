import express from "express";
import {
  getBudgetsByProject,
  getBudgetById,
  createBudget,
  updateBudget,
  updateBudgetStatus,
  deleteBudget,
} from "../controllers/budgetController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/project/:projectId", authenticate, getBudgetsByProject);
router.post("/", authenticate, createBudget);
router.get("/:id", authenticate, getBudgetById);
router.put("/:id", authenticate, updateBudget);
router.patch("/:id/status", authenticate, updateBudgetStatus);
router.delete("/:id", authenticate, deleteBudget);

export default router;
