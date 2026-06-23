import mongoose from "mongoose";

const facilitySchema = new mongoose.Schema(
  {
    nama: {
      type: String,
      required: [true, "Facility name is required"],
      trim: true,
      lowercase: true,
      maxlength: [100, "Facility name cannot exceed 100 characters"],
      minlength: [2, "Facility name must be at least 2 characters"],
      unique: true,
    },
  },
  {
    timestamps: true,
  },
);

// Custom validator
facilitySchema.path("nama").validate(async function (value) {
  const facility = await mongoose.models.Facility.findOne({
    nama: value.toLowerCase(),
    _id: { $ne: this._id },
  });

  return !facility;
}, "Facility name already exists");

facilitySchema.index({ createdAt: -1 });

export default mongoose.model("Facility", facilitySchema);
