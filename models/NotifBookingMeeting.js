import mongoose from "mongoose";

const notifBookingMeetingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meeting",
      default: null,
    },
    type: {
      type: String,
      enum: [
        "meeting_invitation",
        "meeting_updated",
        "meeting_rescheduled",
        "meeting_cancelled",
      ],
      default: "other",
    },
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed, // simpan data tambahan (roomId, dll)
      default: {},
    },
  },
  { timestamps: true },
);

// Query yang paling sering: list notif per user, urut terbaru, filter belum dibaca
notifBookingMeetingSchema.index({ userId: 1, createdAt: -1 });
notifBookingMeetingSchema.index({ userId: 1, isRead: 1 });

const NotifBookingMeeting = mongoose.model(
  "NotifBookingMeeting",
  notifBookingMeetingSchema,
);

export default NotifBookingMeeting;
