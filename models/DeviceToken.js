import mongoose from "mongoose";

const deviceTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    token: {
      type: String,
      required: true,
    },
    deviceType: {
      type: String, // 'ios', 'android', 'web'
      default: 'mobile',
    },
    isActive: {
      type: Boolean,
      default: true,
    }
  },
  {
    timestamps: true,
  }
);

// Ensure a token is unique, so we don't save duplicates
deviceTokenSchema.index({ token: 1 }, { unique: true });
// Optionally, index userId for faster queries
deviceTokenSchema.index({ userId: 1 });

const DeviceToken = mongoose.model("DeviceToken", deviceTokenSchema);

export default DeviceToken;
