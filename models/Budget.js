import mongoose from "mongoose";

const budgetSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project wajib diisi"],
      index: true,
    },
    boqItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BOQItem",
      required: [true, "BOQ Item wajib dipilih"],
      index: true,
    },
    budgetCode: {
      type: String,
      required: [true, "Budget Code wajib diisi"],
      trim: true,
      index: true,
    },
    plannedAmount: {
      type: Number,
      required: [true, "Planned Budget wajib diisi"],
      min: [0, "Planned Budget tidak boleh negatif"],
      default: 0,
    },
    approvedAmount: {
      type: Number,
      min: [0, "Approved Budget tidak boleh negatif"],
      default: 0,
    },
    approvalNote: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["Draft", "Submitted", "Approved", "Rejected"],
      default: "Draft",
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

budgetSchema.index({ project: 1, boqItem: 1 });
budgetSchema.index({ project: 1, status: 1 });
budgetSchema.index({ project: 1, budgetCode: 1 }, { unique: true });

export default mongoose.model("Budget", budgetSchema);
