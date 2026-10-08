import express from "express";
import { authenticate } from "../middleware/auth.js";
import {
  listBiddings,
  getBidding,
  createBidding,
  updateBidding,
  updateBiddingItems,
  updateBiddingSuppliers,
  updateBiddingQuotations,
  updateBiddingSelections,
  finishBidding,
  deleteBidding,
} from "../controllers/biddingController.js";

const router = express.Router();
router.use(authenticate);

router.get("/project/:projectId", listBiddings);
router.get("/:id", getBidding);

router.post("/", createBidding);
router.put("/:id", updateBidding);
router.delete("/:id", deleteBidding);
router.patch("/:id/items", updateBiddingItems);
router.patch("/:id/suppliers", updateBiddingSuppliers);
router.patch("/:id/quotations", updateBiddingQuotations);
router.patch("/:id/selections", updateBiddingSelections);
router.post("/:id/finish", finishBidding);

export default router;
