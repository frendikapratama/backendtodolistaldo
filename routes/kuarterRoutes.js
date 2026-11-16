import express from "express";
import {
  create,
  get,
  edit,
  deleteKuarter,
  getById,
} from "../controllers/kuarterController.js";
import { authenticate, requireSystemAdmin } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, get);
router.post("/", authenticate, requireSystemAdmin, create);
router.get("/:KuarterId", authenticate, getById);
router.put("/:KuarterId", authenticate, requireSystemAdmin, edit);
router.delete("/:KuarterId", authenticate, requireSystemAdmin, deleteKuarter);

export default router;
