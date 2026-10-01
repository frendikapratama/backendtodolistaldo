import mongoose from "mongoose";

const projectPartySchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    party: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      required: true,
    },
    role: {
      type: String,
      enum: ["client", "vendor"],
      required: true,
    },
  },
  {
    timestamps: false,
  },
);

projectPartySchema.index({ project: 1, party: 1 }, { unique: true });

export default mongoose.model("ProjectParty", projectPartySchema);
