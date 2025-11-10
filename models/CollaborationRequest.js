import mongoose from "mongoose";

const collaborationRequestSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    fromWorkspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    toWorkspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

collaborationRequestSchema.index({
  project: 1,
  fromWorkspace: 1,
  toWorkspace: 1,
  status: 1,
});

collaborationRequestSchema.index({ toWorkspace: 1, status: 1 });
collaborationRequestSchema.index({ fromWorkspace: 1, status: 1 });

export default mongoose.model(
  "CollaborationRequest",
  collaborationRequestSchema
);
