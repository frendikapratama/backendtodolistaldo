import mongoose from 'mongoose'

const sessionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    refreshToken: { type: String, required: true },
    expiresAt: { type: String, required: true },
    revoked: { type: String, default: false},
}, { timeStamps: true });

export default mongoose.model("Session", sessionSchema)