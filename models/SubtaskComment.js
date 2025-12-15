import mongoose from "mongoose";

const subtaskCommentSchema = new mongoose.Schema(
  {
    subtask: { type: mongoose.Schema.Types.ObjectId, ref: "Subtask" },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    text: String,
    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubtaskComment",
      default: null,
    },
    depth: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("SubtaskComment", subtaskCommentSchema);
