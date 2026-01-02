import express from "express";
import { authenticate } from "../middleware/auth.js";
import {
  addBookmark,
  getBookmarks,
  removeBookmark,
} from "../controllers/bookmarkController.js";

const router = express.Router();

router.get("/", authenticate, getBookmarks);
router.post("/:projectId", authenticate, addBookmark);
router.delete("/:bookmarkId", authenticate, removeBookmark);

export default router;
