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
  updateProfile,
  addUserToWorkspace,
  removeUserFromWorkspace,
  updateUserWorkspaceRole,
} from "../controllers/userController.js";
import { authenticate, requireSystemAdmin } from "../middleware/auth.js";
import multer from "multer";
import fs from "fs";
import path from "path";

// Pastikan directory uploads/users ada
const uploadsDir = path.join(process.cwd(), "uploads", "users");
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

router.get("/me", authenticate, async (req, res) => {
  try {
    const user = await req.user.populate({
      path: "workspaces.workspace",
      select: "nama photo",
    });
    res.json({ user });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch user data",
      error: error.message,
    });
  }
  res.json({ user: req.user });
  
  //   const user = req.user.toObject();
  //   delete user.password;
  //   delete user.resetOTP;
  //   delete user.resetOTPExpire;
  //   delete user.__v;

  //  res.json({ user });
});
// router.get("/me", authenticate, getProfile);
router.put("/me", authenticate, upload.single("photo"), updateProfile);

router.post("/", authenticate, requireSystemAdmin, createUser);

router.get("/", getUsers);
router.put("/:id", authenticate, updateUser);
router.get("/:id", authenticate, getUserById);
router.delete("/:id", authenticate, deleteUser);

// Workspace membership management routes for system admin
router.post("/:id/workspaces", authenticate, requireSystemAdmin, addUserToWorkspace);
router.delete("/:id/workspaces/:workspaceId", authenticate, requireSystemAdmin, removeUserFromWorkspace);
router.put("/:id/workspaces/:workspaceId/role", authenticate, requireSystemAdmin, updateUserWorkspaceRole);

router.post("/forget-password", sendOTP);
router.post("/change-password", changePassword);

export default router;
