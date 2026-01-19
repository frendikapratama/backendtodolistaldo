import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    nama: { type: String },
    description: { type: String },
    pic: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    status: { type: String, default: "Not Started" },
    meeting_date: { type: Date },
    start_date: { type: Date },
    due_date: { type: Date },
    finish_date: { type: Date },
    note: { type: String, default: "Planning" },
    priority: { type: String },
    position: { type: Number, default: 0 },
    groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace" },
    subtask: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subtask" }],
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
    attachments: [
      {
        fileName: { type: String, required: true },
        fileSize: { type: Number },
        fileType: { type: String },
        fileUrl: { type: String, required: true },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    meeting_link: { type: String },
  },
  { timestamps: true }
);
taskSchema.index({ workspace: 1 });
taskSchema.index({ project: 1 });
taskSchema.index({ workspace: 1, status: 1 });
taskSchema.index({ project: 1, status: 1 });
export default mongoose.model("Task", taskSchema);
