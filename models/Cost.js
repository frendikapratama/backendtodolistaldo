import mongoose from "mongoose";

const costSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project wajib diisi"],
      index: true,
    },
    budget: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Budget",
      required: [true, "Budget wajib dipilih"],
      index: true,
    },
    boqItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BOQItem",
      required: [true, "BOQ Item wajib dipilih"],
      index: true,
    },
    costCode: {
      type: String,
      required: [true, "Cost Code wajib diisi"],
      trim: true,
      index: true,
    },
    costDate: {
      type: Date,
      required: [true, "Tanggal Cost wajib diisi"],
      default: Date.now,
      index: true,
    },
    description: {
      type: String,
      required: [true, "Deskripsi biaya wajib diisi"],
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, "Nilai biaya (amount) wajib diisi"],
      min: [0.01, "Amount harus lebih besar dari 0"],
      default: 0,
    },
    status: {
      type: String,
      enum: ["Draft", "Submitted", "Approved", "Rejected"],
      default: "Draft",
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
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

costSchema.index({ project: 1, budget: 1, status: 1 });
costSchema.index({ project: 1, costCode: 1 }, { unique: true });
costSchema.index({ project: 1, costDate: -1 });

export default mongoose.model("Cost", costSchema);
