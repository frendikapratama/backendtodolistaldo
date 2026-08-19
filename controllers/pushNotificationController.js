import DeviceToken from "../models/DeviceToken.js";
import { sendPushNotification } from "../utils/expoPushUtils.js";

import NotifBookingMeeting from "../models/NotifBookingMeeting.js";
import { handleError } from "../utils/errorHandler.js";

export const savePushToken = async (req, res) => {
  try {
    const { token, deviceType } = req.body;
    const userId = req.user._id; // from authenticate middleware

    if (!token) {
      return res
        .status(400)
        .json({ success: false, message: "Push token is required" });
    }

    // Check if token already exists
    let deviceToken = await DeviceToken.findOne({ token });

    if (deviceToken) {
      // If it exists but belongs to a different user, update the user (e.g., someone else logged in on the same device)
      if (deviceToken.userId.toString() !== userId.toString()) {
        deviceToken.userId = userId;
        deviceToken.isActive = true;
        await deviceToken.save();
      }
    } else {
      // Create new token entry
      deviceToken = new DeviceToken({
        userId,
        token,
        deviceType: deviceType || "mobile",
        isActive: true,
      });
      await deviceToken.save();
    }

    res
      .status(200)
      .json({ success: true, message: "Push token saved successfully" });
  } catch (error) {
    console.error("Error saving push token:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const testPushNotification = async (req, res) => {
  try {
    const { targetUserId, title, body, data } = req.body;

    if (!targetUserId || !title || !body) {
      return res.status(400).json({
        success: false,
        message: "targetUserId, title, and body are required",
      });
    }

    const success = await sendPushNotification(
      targetUserId,
      title,
      body,
      data || { type: "test", messageId: "123" },
    );

    if (success) {
      res
        .status(200)
        .json({ success: true, message: "Test notification sent" });
    } else {
      res.status(404).json({
        success: false,
        message: "Failed to send notification or no active tokens found",
      });
    }
  } catch (error) {
    console.error("Error in testPushNotification:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20, unreadOnly } = req.query;

    const filter = { userId };
    if (unreadOnly === "true") filter.isRead = false;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const [data, total, unreadCount] = await Promise.all([
      NotifBookingMeeting.find(filter)
        .populate("meetingId", "title startTime endTime")
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      NotifBookingMeeting.countDocuments(filter),
      NotifBookingMeeting.countDocuments({ userId, isRead: false }),
    ]);

    return res.status(200).json({
      success: true,
      data,
      unreadCount,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notif = await NotifBookingMeeting.findOneAndUpdate(
      { _id: id, userId },
      { isRead: true, readAt: new Date() },
      { new: true },
    );

    if (!notif) {
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    }

    return res.status(200).json({ success: true, data: notif });
  } catch (error) {
    return handleError(res, error);
  }
};

export const markAllNotificationsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    await NotifBookingMeeting.updateMany(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return res
      .status(200)
      .json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    return handleError(res, error);
  }
};
