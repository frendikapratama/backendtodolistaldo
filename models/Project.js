import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    nama: { type: String },
    // description: { type: String },
    startedAt: { type: Date, default: Date.now },
    dueDate: { type: Date },
    status: {
      type: String,
      enum: [
        "draft",
        "planning",
        "in progress",
        "hold",
        "completed",
        "cancelled",
      ],
      default: "draft",
    },
    projectManager: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    sites: {
      type: [
        {
          type: String,
          enum: ["PT", "HPC", "PBPG"],
        },
      ],
      default: [],
    },
    // workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace" },
    divisionId: [{ type: mongoose.Schema.Types.ObjectId, ref: "Division" }],
    groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // otherWorkspaces: [
    //   { type: mongoose.Schema.Types.ObjectId, ref: "Workspace" },
    // ],
  },
  { timestamps: true },
);

projectSchema.virtual("parties", {
  ref: "ProjectParty",
  localField: "_id",
  foreignField: "project",
});

projectSchema.set("toJSON", {
  virtuals: true,
});

projectSchema.set("toObject", {
  virtuals: true,
});

export default mongoose.model("Project", projectSchema);
