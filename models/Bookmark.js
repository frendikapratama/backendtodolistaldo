import mongoose from "mongoose";

const bookmarkSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// mencegah duplicate bookmark (user + project)
bookmarkSchema.index({ user: 1, project: 1 }, { unique: true });

export default mongoose.model("Bookmark", bookmarkSchema);
