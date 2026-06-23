import mongoose from "mongoose";

const meetingParticipantSchema = new mongoose.Schema(
  {
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meeting",
      required: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    invitationStatus: {
      type: String,
      enum: ["pending", "accepted", "rejected", "tentative"],
      default: "pending",
    },

    responseAt: {
      type: Date,
      default: null,
    },

    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

meetingParticipantSchema.index(
  {
    meetingId: 1,
    userId: 1,
  },
  {
    unique: true,
  },
);

meetingParticipantSchema.index({
  userId: 1,
});

meetingParticipantSchema.index({
  meetingId: 1,
});

export default mongoose.model("MeetingParticipant", meetingParticipantSchema);
