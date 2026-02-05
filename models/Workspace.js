import mongoose from "mongoose";

const workspaceSchema = new mongoose.Schema(
  {
    nama: { type: String, required: true },
    projects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Project" }],
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    members: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        role: {
          type: String,
          enum: ["admin", "project_manager", "member", "viewer", "management"],
          default: "member",
        },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    pendingInvites: [
      {
        email: { type: String },
        token: { type: String },
        role: {
          type: String,
          enum: ["admin", "project_manager", "member", "viewer", "management"],
          default: "member",
        },
        createdAt: { type: Date, default: Date.now },
        expiresAt: { type: Date },
      },
    ],
    kuarter: { type: mongoose.Schema.Types.ObjectId, ref: "Kuarter" },
  },
  { timestamps: true },
);

export default mongoose.model("Workspace", workspaceSchema);
