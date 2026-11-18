import mongoose from "mongoose";

const meetingAttendanceSchema = new mongoose.Schema(
  {
    meetingId: { type: mongoose.Schema.Types.ObjectId, ref: "Meeting", required: true, index: true },
    participantId: { type: mongoose.Schema.Types.ObjectId, ref: "MeetingParticipant", default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    photo: { type: String, required: true },
    checkedInAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

meetingAttendanceSchema.index(
  { meetingId: 1, participantId: 1 },
  { unique: true, partialFilterExpression: { participantId: { $type: "objectId" } } },
);
meetingAttendanceSchema.index(
  { meetingId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: "objectId" } } },
);

export default mongoose.model("MeetingAttendance", meetingAttendanceSchema);
