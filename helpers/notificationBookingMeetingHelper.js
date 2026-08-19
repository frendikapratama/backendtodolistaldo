import NotifBookingMeeting from "../models/NotifBookingMeeting.js";
import { sendPushNotification } from "../utils/expoPushUtils.js";

export const notifyUser = async (userId, title, body, data = {}, io = null) => {
  let saved = null;
  try {
    saved = await NotifBookingMeeting.create({
      userId,
      meetingId: data.meetingId || null,
      type: data.type || "other",
      title,
      body,
      metadata: data,
    });

    // opsional: biar notif page bisa update realtime tanpa refresh
    if (io) {
      io.emit("notification:new", { userId, notification: saved });
    }
  } catch (err) {
    console.error("Failed to save notification to DB:", err);
  }

  // push tetap jalan meskipun simpan DB gagal
  const pushResult = await sendPushNotification(userId, title, body, data);
  return { saved, pushResult };
};
