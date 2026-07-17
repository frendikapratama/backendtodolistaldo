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
      required: function () {
        return !this.isExternal;
      },
      index: true,
    },

    isExternal: {
      type: Boolean,
      default: false,
    },
    externalName: {
      type: String,
      default: null,
    },
    externalEmail: {
      type: String,
      default: null,
    },
    externalNoHp: {
      type: String,
      default: null,
    },

    invitationStatus: {
      type: String,
      enum: ["pending", "accepted", "decline", "tentative"],
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

// unique index lama hanya berlaku untuk peserta internal (userId ada)
meetingParticipantSchema.index(
  { meetingId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: "objectId" } } },
);

// unique index baru untuk peserta eksternal, berdasarkan email
meetingParticipantSchema.index(
  { meetingId: 1, externalEmail: 1 },
  { unique: true, partialFilterExpression: { isExternal: true } },
);

meetingParticipantSchema.index({ userId: 1 });
meetingParticipantSchema.index({ meetingId: 1 });

export default mongoose.model("MeetingParticipant", meetingParticipantSchema);
