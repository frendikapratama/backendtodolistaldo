import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      // required: true,
    },
    type: {
      type: String,
      enum: [
        "TASK_STATUS_CHANGED",
        "TASK_ASSIGNED",
        "TASK_COMMENT",
        "TASK_REPLY_COMMENT",
        "TASK_ATTACHMENT_UPLOADED",
        "TASK_DUE_SOON",
        "TASK_OVERDUE",
        "MENTION",
        "SUBTASK_COMMENT",
        "REPLY_SUBTASK_COMMENT",
        "SUBTASK_ATTACHMENT_UPLOADED",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
    },
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
    },
    metadata: {
      oldStatus: String,
      newStatus: String,
      taskName: String,
      projectName: String,
      workspaceName: String,
      daysRemaining: Number,
      daysOverdue: Number,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
