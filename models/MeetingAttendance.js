import mongoose from "mongoose";

const meetingAttendanceSchema = new mongoose.Schema(
  {
    meetingId: { type: mongoose.Schema.Types.ObjectId, ref: "Meeting", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    photo: { type: String, required: true },
    checkedInAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

meetingAttendanceSchema.index({ meetingId: 1, userId: 1 }, { unique: true });

export default mongoose.model("MeetingAttendance", meetingAttendanceSchema);
