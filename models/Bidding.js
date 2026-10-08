import mongoose from "mongoose";

const quotationSchema = new mongoose.Schema(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      required: true,
    },
    unitPrice: { type: Number, required: true, min: 0 },
    leadTime: { type: String, default: "" },
    paymentTerm: { type: String, default: "" },
    notes: { type: String, default: "" },
    quotedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const biddingItemSchema = new mongoose.Schema(
  {
    boqItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BOQItem",
      required: true,
    },
    quotations: { type: [quotationSchema], default: [] },
    selectedSupplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      default: null,
    },
    selectionReason: { type: String, trim: true, default: "" },
    selectedAt: { type: Date, default: null },
    selectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: true },
);

const biddingSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["DRAFT", "IN_PROGRESS", "FINISHED", "QUOTATION", "EVALUATION"],
      default: "DRAFT",
      index: true,
    },
    suppliers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Party" }],
    items: { type: [biddingItemSchema], default: [] },
    finishedAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export default mongoose.model("Bidding", biddingSchema);
