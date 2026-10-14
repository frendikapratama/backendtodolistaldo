import mongoose from "mongoose";

const resourcePlanningSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    resource: { type: mongoose.Schema.Types.ObjectId, ref: "Resource", required: true, index: true },
    boqItem: { type: mongoose.Schema.Types.ObjectId, ref: "BOQItem", default: null, index: true },
    plannedQuantity: { type: Number, required: true, min: [0.000001, "Kuantitas harus lebih besar dari 0"] },
    unit: { type: String, required: true, trim: true },
    plannedStartDate: { type: Date, default: null },
    plannedEndDate: { type: Date, default: null },
    notes: { type: String, trim: true, default: "", maxlength: 2000 },
    status: { type: String, enum: ["Planned", "Confirmed", "Cancelled"], default: "Planned", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

resourcePlanningSchema.pre("validate", function validateDateRange(next) {
  if (this.plannedStartDate && this.plannedEndDate && this.plannedEndDate < this.plannedStartDate) {
    this.invalidate("plannedEndDate", "Tanggal selesai tidak boleh sebelum tanggal mulai");
  }
  next();
});

resourcePlanningSchema.index({ project: 1, resource: 1 });

export default mongoose.model("ResourcePlanning", resourcePlanningSchema);
