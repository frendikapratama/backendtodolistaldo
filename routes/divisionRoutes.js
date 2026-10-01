import express from "express";

import { getAllDivisions } from "../controllers/divisionController.js";

const router = express.Router();

router.get("/", getAllDivisions);

export default router;
