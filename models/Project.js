import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    nama: { type: String },
    description: String,
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace" },
    groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    otherWorkspaces: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Workspace" },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Project", projectSchema);
