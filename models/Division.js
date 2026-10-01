import mongoose from "mongoose";

const divisionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
  },
  {
    timestamps: false,
  },
);

export default mongoose.model("Division", divisionSchema);
