import mongoose from "mongoose";

const workspaceSchema = new mongoose.Schema(
  {
    nama: { type: String, required: true },
    projects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Project" }],
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    pendingInvites: [
      {
        email: { type: String },
        token: { type: String },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    kuarter: { type: mongoose.Schema.Types.ObjectId, ref: " Kuarter" },
  },
  { timestamps: true }
);
export default mongoose.model("Workspace", workspaceSchema);
