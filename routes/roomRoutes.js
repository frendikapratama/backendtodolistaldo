import express from "express";
import {
  createRoom,
  getRooms,
  deleteRoom,
  updateRoom,
} from "../controllers/roomController.js";
import multer from "multer";
import fs from "fs";
import path from "path";

const uploadsDir = path.join(process.cwd(), "uploads", "rooms");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const router = express.Router();
router.get("/", getRooms);
router.post("/", upload.single("photo"), createRoom);
router.delete("/:id", deleteRoom);
router.put("/:id", upload.single("photo"), updateRoom);
export default router;
