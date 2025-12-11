import express from "express";
import {
  createUser,
  getUsers,
  getUserById,
  sendOTP,
  changePassword,
  updateUser,
  deleteUser,
  getProfile,
  updateProfile
} from "../controllers/userController.js";
import { authenticate } from "../middleware/auth.js";
import multer from "multer";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/users/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({
  storage: storage,
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

router.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });

  //   const user = req.user.toObject();
  //   delete user.password;
  //   delete user.resetOTP;
  //   delete user.resetOTPExpire;
  //   delete user.__v;

  //  res.json({ user });
});
router.put("/me", authenticate, upload.single("photo"), updateProfile);

router.post("/", createUser);

router.get("/", getUsers);
router.put("/:id", authenticate, updateUser);
router.get("/:id", authenticate, getUserById);
router.delete("/:id", authenticate, deleteUser);

router.post("/forget-password", sendOTP);
router.post("/change-password", changePassword);

export default router;
