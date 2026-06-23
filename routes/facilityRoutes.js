import express from "express";

import {
  createFacility,
  getFacilities,
  deleteFacility,
  updateFacility,
} from "../controllers/facilityController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/", getFacilities);
router.post("/", createFacility);
router.delete("/:id", deleteFacility);
router.put("/:id", updateFacility);

export default router;
