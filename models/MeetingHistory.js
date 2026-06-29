import mongoose from "mongoose";

const meetingHistorySchema = new mongoose.Schema(
  {
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meeting",
      required: true,
      index: true,
    },

    action: {
      type: String,
      enum: [
        "created",
        "updated",
        "rescheduled",
        "cancelled",
        "result_added",
        "result_updated",
        "result_deleted",
      ],
      required: true,
    },

    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    oldData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    newData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("MeetingHistory", meetingHistorySchema);
