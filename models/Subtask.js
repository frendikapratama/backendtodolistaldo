import mongoose from "mongoose";

const subtaskSchema = new mongoose.Schema(
  {
    nama: { type: String },
    description: String,
    pic: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    status: { type: String, default: "Not Started" },
    meeting_date: { type: Date },
    start_date: { type: Date },
    due_date: { type: Date },
    finish_date: { type: Date },
    note: { type: String, default: "Planning" },
    priority: { type: String },
    position: { type: Number, default: 0 },
    task: { type: mongoose.Schema.Types.ObjectId, ref: "Task" },
    pendingPicInvites: [
      {
        email: { type: String },
        token: { type: String },
        invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
        expiresAt: {
          type: Date,
          default: () => Date.now() + 7 * 24 * 60 * 60 * 1000,
        },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Subtask", subtaskSchema);
