import mongoose from "mongoose";
const roomSchema = new mongoose.Schema({
  nama: {
    type: String,
    required: true,
  },
  lokasi: {
    type: String,
    required: true,
  },
  photo: String,
  facilities: [
    {
      facilityId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Facility",
        required: true,
      },
      total: {
        type: Number,
        required: true,
        min: 0,
        default: 1,
      },
    },
  ],
  kapasitas: {
    type: Number,
    required: true,
    min: 1,
  },
});

export default mongoose.model("Room", roomSchema);
