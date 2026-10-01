import express from "express";
import {
  getParty,
  createParty,
  updateParty,
  deleteParty,
} from "../controllers/partyController.js";

const router = express.Router();

router.get("/", getParty);
router.post("/", createParty);
router.put("/:id", updateParty);
router.delete("/:id", deleteParty);

export default router;
