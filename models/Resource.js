import mongoose from "mongoose";

const resourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    category: {
      type: String,
      required: true,
      enum: ["Material", "Manpower", "Equipment"],
      index: true,
    },
    unit: { type: String, required: true, trim: true, maxlength: 40 },
    description: { type: String, trim: true, default: "", maxlength: 2000 },
    estimatedPrice: { type: Number, min: 0, default: null },
    brand: { type: String, trim: true, default: "", maxlength: 120 },
    technicalSpecs: { type: String, trim: true, default: "", maxlength: 2000 },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

resourceSchema.index({ code: 1 }, { unique: true });
resourceSchema.index({ name: "text", code: "text", description: "text" });

export default mongoose.model("Resource", resourceSchema);
