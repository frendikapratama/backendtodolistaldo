import mongoose from "mongoose";

const partySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      unique: [true, "Party name already exists"],
    },
    email: {
      type: String,
      unique: true,
      unique: [true, "Party email already exists"],
    },
    phone: {
      type: String,
      unique: [true, "Party phone number already exists"],
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: false,
  },
);

export default mongoose.model("Party", partySchema);
