import express from "express";
import {
  login,
  refresh,
  logout,
  loginMobile,
  refreshMobile,
  logoutMobile,
} from "../controllers/authController.js";
import { updateProfile } from "../controllers/userController.js";

const router = express.Router();

router.post("/login", login);
router.get("/refresh", refresh);
router.post("/logout", logout);

// MOBILE
router.post("/login/mobile", loginMobile);
router.post("/refresh/mobile", refreshMobile);
router.post("/logout/mobile", logoutMobile);
export default router;
