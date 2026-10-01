import mongoose from "mongoose";

const boqItemSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project wajib diisi"],
      index: true,
    },
    itemCode: {
      type: String,
      trim: true,
      default: "",
    },
    section: {
      type: String,
      required: [true, "Section/Category wajib diisi"],
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: [true, "Deskripsi pekerjaan wajib diisi"],
      trim: true,
    },
    unit: {
      type: String,
      required: [true, "Satuan (unit) wajib diisi"],
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, "Quantity wajib diisi"],
      min: [0, "Quantity tidak boleh bernilai negatif"],
      default: 0,
    },
    unitPrice: {
      type: Number,
      required: [true, "Unit price wajib diisi"],
      min: [0, "Unit price tidak boleh bernilai negatif"],
      default: 0,
    },
    totalPrice: {
      type: Number,
      min: [0, "Total price tidak boleh negatif"],
      default: 0,
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

// Compound indexes for optimal sorting & querying per project
boqItemSchema.index({ project: 1, section: 1, createdAt: 1 });
boqItemSchema.index({ project: 1, status: 1 });
boqItemSchema.index({ project: 1, totalPrice: -1 });

// Auto-calculate totalPrice prior to saving
boqItemSchema.pre("save", function (next) {
  const qty = Number(this.quantity) || 0;
  const price = Number(this.unitPrice) || 0;
  this.totalPrice = Math.round(qty * price * 100) / 100;
  next();
});

export default mongoose.model("BOQItem", boqItemSchema);
