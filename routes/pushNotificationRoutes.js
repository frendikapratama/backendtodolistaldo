import express from "express";
import {
  savePushToken,
  testPushNotification,
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../controllers/pushNotificationController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Both routes require authentication
router.post("/token", authenticate, savePushToken);
router.post("/test", testPushNotification);

router.get("/", authenticate, getMyNotifications);
router.patch("/:id/read", authenticate, markNotificationRead);
router.patch("/read-all", authenticate, markAllNotificationsRead);

export default router;
