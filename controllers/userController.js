import User from "../models/User.js";
import Workspace from "../models/Workspace.js";
import { transporter } from "../utils/sendEmail.js";
import fs from "fs";
import path from "path";
import { handleError } from "../utils/errorHandler.js";

export async function getUsers(req, res) {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      isSystemAdmin,
      departemen,
      divisi,
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};

    // Filter system admin
    if (isSystemAdmin && isSystemAdmin !== "all") {
      filter.isSystemAdmin = isSystemAdmin === "true";
    }

    // Filter departemen & divisi
    if (departemen && departemen !== "all") {
      filter.departemen = departemen;
    }
    if (divisi && divisi !== "all") {
      filter.divisi = divisi;
    }

    // Search filter
    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [{ username: regex }, { email: regex }, { posisi: regex }];
    }

    const users = await User.find(filter)
      .select("-__v -password -resetOTP -resetOTPExpire")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(filter);

    res.status(200).json({
      success: true,
      message: "Get users success",
      data: users,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getUserById(req, res) {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select(
      "-password -resetOTP -resetOTPExpire",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get user's workspaces dengan role
    const userWorkspaces = await Workspace.find({
      $or: [{ owner: id }, { "members.user": id }],
    })
      .select("nama owner members")
      .populate("owner", "username email");

    const workspacesWithRole = userWorkspaces.map((workspace) => {
      const workspaceObj = workspace.toObject();
      if (workspace.owner._id.toString() === id) {
        workspaceObj.userRole = "owner";
      } else {
        const member = workspace.members.find((m) => m.user.toString() === id);
        workspaceObj.userRole = member?.role || "none";
      }
      return workspaceObj;
    });

    const userData = {
      ...user.toObject(),
      workspaces: workspacesWithRole,
    };

    res.status(200).json({
      success: true,
      data: userData,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createUser(req, res) {
  try {
    const {
      username,
      email,
      password,
      noHp,
      departemen,
      divisi,
      posisi,
      isSystemAdmin,
    } = req.body;

    // Validasi required fields
    if (!username || !email || !password || !noHp || !posisi) {
      return res.status(400).json({
        success: false,
        message: "Username, email, password, noHp, and posisi are required",
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    const user = new User({
      username,
      email,
      password,
      noHp,
      departemen,
      divisi,
      posisi,
      isSystemAdmin: Boolean(isSystemAdmin),
    });

    await user.save();

    // Remove sensitive data from response
    const userResponse = {
      id: user._id,
      username: user.username,
      email: user.email,
      noHp: user.noHp,
      departemen: user.departemen,
      divisi: user.divisi,
      posisi: user.posisi,
      isSystemAdmin: user.isSystemAdmin,
      createdAt: user.createdAt,
    };

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: userResponse,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const currentUserId = req.user._id;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Permission check: hanya system admin atau user sendiri yang bisa update
    if (!req.user.isSystemAdmin && currentUserId.toString() !== id) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. Can only update your own profile or need system admin rights",
      });
    }

    // Fields yang boleh diupdate
    const allowedFields = [
      "username",
      "email",
      "noHp",
      "departemen",
      "divisi",
      "posisi",
    ];

    // Hanya system admin yang bisa ubah isSystemAdmin
    if (req.user.isSystemAdmin) {
      allowedFields.push("isSystemAdmin");
    }

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    // Handle photo upload
    if (req.file) {
      // Delete old photo if exists
      if (user.photo) {
        const oldPath = `uploads/users/${user.photo}`;
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
      user.photo = req.file.filename;
    }

    await user.save();

    // Remove sensitive data from response
    const userResponse = {
      id: user._id,
      username: user.username,
      email: user.email,
      noHp: user.noHp,
      departemen: user.departemen,
      divisi: user.divisi,
      posisi: user.posisi,
      isSystemAdmin: user.isSystemAdmin,
      photo: user.photo,
      updatedAt: user.updatedAt,
    };

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: userResponse,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    const currentUserId = req.user._id;

    // User tidak bisa delete diri sendiri
    if (id === currentUserId.toString()) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete your own account",
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Hanya system admin yang bisa delete user
    if (!req.user.isSystemAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only system admin can delete users",
      });
    }

    // Cek jika user adalah owner workspace
    const ownedWorkspaces = await Workspace.find({ owner: id });
    if (ownedWorkspaces.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete user. User is owner of ${ownedWorkspaces.length} workspace(s). Transfer ownership first.`,
      });
    }

    // Remove user dari semua workspace members
    await Workspace.updateMany(
      { "members.user": id },
      { $pull: { members: { user: id } } },
    );

    // Delete photo jika ada
    if (user.photo) {
      const photoPath = `uploads/users/${user.photo}`;
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
      }
    }

    await User.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    return handleError(res, error);
  }
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendOTP(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const otp = generateOTP();
    user.resetOTP = otp;
    user.resetOTPExpire = new Date(Date.now() + 5 * 60 * 1000); // 5 menit
    await user.save();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Reset Password OTP",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Reset Password</h2>
          <p>Halo ${user.username},</p>
          <p>The OTP code to reset your password is:</p>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0; text-align: center;">
            <h1 style="margin: 0; color: #1f2937; letter-spacing: 5px;">${otp}</h1>
          </div>
          <p>This code will expire in 5 minutes.</p>
          <p>If you did not request a password reset, please ignore this email.</p>
        </div>
      `,
    });

    res.json({
      success: true,
      message: "OTP telah dikirim ke email Anda",
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function changePassword(req, res) {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, OTP, and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.resetOTP !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (!user.resetOTPExpire || user.resetOTPExpire < new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

    user.password = newPassword;
    user.resetOTP = undefined;
    user.resetOTPExpire = undefined;

    await user.save();

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user._id).select(
      "-password -resetOTP -resetOTPExpire",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateProfile(req, res) {
  try {
    console.log("Update profile request body:", req.body);
    console.log("User ID:", req.user._id);

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const allowedFields = [
      "username",
      "noHp",
      "departemen",
      "divisi",
      "posisi",
    ];
    allowedFields.forEach((field) => {
      if (
        req.body[field] !== undefined &&
        req.body[field] !== null &&
        req.body[field] !== ""
      ) {
        user[field] = req.body[field];
      }
    });
    if (req.body.password && req.body.password.trim() !== "") {
      if (req.body.password.length < 6) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters",
        });
      }
      user.password = req.body.password;
    }
    if (req.file) {
      try {
        // Delete old photo if exists
        if (user.photo) {
          const oldPath = path.join(
            process.cwd(),
            "uploads",
            "users",
            user.photo,
          );
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }
        // Save new photo filename
        user.photo = req.file.filename;
      } catch (fileError) {
        console.error("File handling error:", fileError);
        // Clean up uploaded file if something goes wrong
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({
          success: false,
          message: "Error processing file upload",
          error: fileError.message,
        });
      }
    }
    await user.save({ validateBeforeSave: true });
    const userResponse = {
      _id: user._id,
      username: user.username,
      email: user.email,
      noHp: user.noHp,
      departemen: user.departemen,
      divisi: user.divisi,
      posisi: user.posisi,
      isSystemAdmin: user.isSystemAdmin,
      photo: user.photo,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: userResponse,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: errors,
      });
    }

    return handleError(res, error);
  }
}
