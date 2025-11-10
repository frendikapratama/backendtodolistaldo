import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { DEPARTEMEN_DIVISI } from "../utils/departement.js";

const departemenList = DEPARTEMEN_DIVISI.map((item) => item.departemenId);
const divisiList = DEPARTEMEN_DIVISI.flatMap((item) => item.divisi).flat();

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "username is required"],
      trim: true,
      maxlength: [100, "Max 100 karakter"],
    },
    email: {
      type: String,
      required: [true, "email wajib diisi"],
      unique: [true, "email telah terdaftar"],
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Email tidak valid",
      ],
    },
    password: {
      type: String,
      required: [true, "password wajib diisi"],
      minlength: [6, "Minimal 6 karakter"],
    },
    noHp: {
      type: String,
      required: [true, "no hp wajib diisi"],
      maxlength: [15, "maksimal 15 karakter"],
    },
    departemen: { type: String, enum: departemenList },
    divisi: { type: String, enum: divisiList },
    posisi: {
      type: String,
      required: [true, "posisi wajib diisi"],
      maxlength: [50, "maksimal 50 karakter"],
    },
    role: {
      type: String,
      enum: ["admin", "member", "head_dev"],
      default: "member",
    },
    resetOTP: String,
    resetOTPExpire: Date,

    workspaces: [{ type: mongoose.Schema.Types.ObjectId, ref: "Workspace" }],
    assignedTasks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],
    assignedSubtasks: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Subtask" },
    ],
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

export default mongoose.model("User", userSchema);
