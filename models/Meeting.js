import mongoose from "mongoose";

const meetingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },
    organizerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    startTime: {
      type: Date,
      required: true,
      index: true,
    },
    endTime: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["scheduled", "in_progress", "completed", "cancelled"],
      default: "scheduled",
    },
    meetingType: {
      type: String,
      enum: ["offline", "online", "hybrid"],
      default: "offline",
    },
    meetingLink: {
      type: String,
      default: null,
    },
    cancelledReason: {
      type: String,
      default: null,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    meetingResults: {
      type: [
        {
          content: {
            type: String,
            default: null,
          },
          fileName: {
            type: String,
            default: null,
          },
          originalName: {
            type: String,
            default: null,
          },
          uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
          },
          uploadedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);
// cek bentrok room
meetingSchema.index({
  roomId: 1,
  startTime: 1,
  endTime: 1,
});
//cek kalender organizer
meetingSchema.index({
  organizerId: 1,
  startTime: -1,
});

export default mongoose.model("Meeting", meetingSchema);
