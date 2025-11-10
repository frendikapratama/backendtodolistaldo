import express from "express";
import {
  create,
  get,
  edit,
  deleteKuarter,
  getById,
} from "../controllers/kuarterController.js";

const router = express.Router();

router.get("/", get);
router.post("/", create);
router.get("/:KuarterId", getById);
router.put("/:KuarterId", edit);
router.delete("/:KuarterId", deleteKuarter);

export default router;
