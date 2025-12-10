import Project from "../models/Project.js";
import Kuarter from "../models/Kuarter.js";
import Group from "../models/Group.js";
import Workspace from "../models/Workspace.js";
import User from "../models/User.js";
import Task from "../models/Task.js";
import Subtask from "../models/Subtask.js";
import {
  validateInviteToken,
  generateInviteToken,
  createInviteObject,
} from "../utils/inviteUtils.js";
import { findOrCreateUser } from "../utils/userUtils.js";
import { sendWorkspaceInvitationEmail } from "../utils/emailUtils.js";
import { handleError } from "../utils/errorHandler.js";
import bcrypt from "bcrypt";
export async function getWorkspace(req, res) {
  try {
    const data = await Workspace.find().populate("projects", "nama");

    res.status(200).json({
      success: true,
      message: "successfully fetched workspaces",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getWorkspaceById(req, res) {
  try {
    const { workspaceId } = req.params;
    const workspace = await Workspace.findById(workspaceId)
      .populate({
        path: "projects",
        select: "nama createdAt",
        options: { sort: { createdAt: -1 } },
      })
      .populate({
        path: "owner",
        select: "username email",
      })
      .populate({
        path: "members.user",
        select: "username email",
      });

    res.status(200).json({
      success: true,
      message: "successfully fetched workspace",
      data: workspace,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createWorkspace(req, res) {
  try {
    const { kuarterId } = req.params;

    const kuarter = await Kuarter.findById(kuarterId);
    if (!kuarter) {
      return res.status(404).json({
        success: false,
        message: "kuarter not found",
      });
    }

    const newWorkspace = await Workspace.create({
      nama: req.body.nama,
      owner: req.user._id,
      members: [
        {
          user: req.user._id,
          role: "admin", // Owner otomatis jadi admin
        },
      ],
      kuarter: kuarterId,
    });

    await Kuarter.findByIdAndUpdate(kuarterId, {
      $push: { workspace: newWorkspace._id },
    });

    await User.findByIdAndUpdate(req.user._id, {
      $push: {
        workspaces: {
          workspace: newWorkspace._id,
          role: "admin",
        },
      },
    });

    res.status(201).json({
      success: true,
      message: "Workspace created successfully",
      data: newWorkspace,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateWorkspace(req, res) {
  try {
    const { workspaceId } = req.params;
    const { nama } = req.body;

    const updatedWorkspaces = await Workspace.findByIdAndUpdate(
      workspaceId,
      { nama },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: "workspace berhasil diupdate",
      data: updatedWorkspaces,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function deleteWorkspace(req, res) {
  try {
    const { workspaceId } = req.params;

    const projects = await Project.find({ workspace: workspaceId });

    for (const project of projects) {
      const groups = await Group.find({ project: project._id });

      for (const group of groups) {
        const tasks = await Task.find({ groups: group._id });

        for (const task of tasks) {
          await Subtask.deleteMany({ task: task._id });
        }

        await Task.deleteMany({ groups: group._id });
      }

      await Group.deleteMany({ project: project._id });
    }

    await Project.deleteMany({ workspace: workspaceId });

    // Hapus workspace dari user's workspaces array
    await User.updateMany(
      { "workspaces.workspace": workspaceId },
      { $pull: { workspaces: { workspace: workspaceId } } }
    );

    const deletedWorkspace = await Workspace.findByIdAndDelete(workspaceId);

    if (!deletedWorkspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace tidak ditemukan",
      });
    }

    res.status(200).json({
      success: true,
      message: "Workspace, project, group, task, dan subtask berhasil dihapus",
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function inviteMemberByEmail(req, res) {
  try {
    const { workspaceId } = req.params;
    const { email, role = "member" } = req.body;
    const requesterId = req.user._id;

    const workspace = await Workspace.findById(workspaceId).populate(
      "owner",
      "username"
    );

    if (!workspace)
      return res.status(404).json({ message: "Workspace tidak ditemukan" });

    if (workspace.owner._id.toString() !== requesterId.toString()) {
      return res
        .status(403)
        .json({ message: "Hanya owner yang dapat mengundang anggota" });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      const isMember = workspace.members.some(
        (m) => m.user.toString() === existingUser._id.toString()
      );

      if (isMember) {
        return res
          .status(400)
          .json({ message: "User sudah menjadi anggota workspace" });
      }

      await Workspace.findByIdAndUpdate(workspaceId, {
        $push: {
          members: {
            user: existingUser._id,
            role: role,
          },
        },
      });

      await User.findByIdAndUpdate(existingUser._id, {
        $push: {
          workspaces: {
            workspace: workspaceId,
            role: role,
          },
        },
      });

      console.log(`✅ ${email} langsung ditambahkan sebagai ${role}`);
      return res.status(200).json({
        success: true,
        message: "User sudah terdaftar dan ditambahkan ke workspace",
      });
    }

    const inviteToken = generateInviteToken();

    await Workspace.findByIdAndUpdate(workspaceId, {
      $push: {
        pendingInvites: createInviteObject(email, inviteToken, { role }),
      },
    });

    const isRegistered = !!existingUser;

    const frontendUrl = process.env.CLIENT_URL;
    const inviteUrl = `${frontendUrl}/accept-workspace-invite?token=${inviteToken}&workspaceId=${workspaceId}&registered=${isRegistered}`;

    await sendWorkspaceInvitationEmail({
      to: email,
      workspaceName: workspace.nama,
      inviteUrl,
      inviterName: workspace.owner.username,
      role,
    });

    res.status(200).json({
      success: true,
      message: "Undangan berhasil dikirim via email",
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function verifyWorkspaceInvite(req, res) {
  try {
    const { workspaceId } = req.params;
    const { token } = req.query;

    const workspace = await Workspace.findById(workspaceId).populate(
      "owner",
      "username"
    );

    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace tidak ditemukan",
      });
    }

    const invitation = workspace.pendingInvites.find(
      (inv) => inv.token === token
    );

    if (!invitation) {
      return res.status(400).json({
        success: false,
        message: "Token undangan tidak valid atau sudah kedaluwarsa",
      });
    }

    const tokenAge = Date.now() - invitation.createdAt.getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    if (tokenAge > sevenDays) {
      return res.status(400).json({
        success: false,
        message: "Token undangan sudah kedaluwarsa",
      });
    }

    const existingUser = await User.findOne({ email: invitation.email });

    res.json({
      success: true,
      data: {
        workspaceName: workspace.nama,
        invitedEmail: invitation.email,
        role: invitation.role,
        inviterName: workspace.owner?.username || "Admin",
        isRegistered: !!existingUser,
      },
    });
  } catch (error) {
    console.error("Error verifying workspace invite:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
    });
  }
}

export async function acceptWorkspaceInvite(req, res) {
  try {
    const { workspaceId } = req.params;
    const { token } = req.query;
    const userData = req.body;

    if (!token || !workspaceId) {
      return res.status(400).json({
        success: false,
        message: "Token dan workspaceId wajib disertakan",
      });
    }

    const workspace = await Workspace.findById(workspaceId)
      .populate("owner", "username")
      .populate("members.user", "email");

    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace tidak ditemukan",
      });
    }

    const invitation = workspace.pendingInvites.find(
      (inv) => inv.token === token
    );

    if (!invitation) {
      return res.status(400).json({
        success: false,
        message: "Token undangan tidak valid atau sudah digunakan",
      });
    }

    const tokenAge = Date.now() - invitation.createdAt.getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    if (tokenAge > sevenDays) {
      await Workspace.findByIdAndUpdate(workspaceId, {
        $pull: { pendingInvites: { token: token } },
      });

      return res.status(400).json({
        success: false,
        message: "Token undangan sudah kedaluwarsa",
      });
    }

    let user = await User.findOne({ email: invitation.email.toLowerCase() });

    if (!user) {
      if (!userData.username || !userData.password) {
        return res.status(400).json({
          success: false,
          message: "Username dan password wajib diisi untuk pendaftaran baru",
        });
      }

      const existingUsername = await User.findOne({
        username: userData.username,
      });

      if (existingUsername) {
        return res.status(400).json({
          success: false,
          message: "Username sudah digunakan",
        });
      }

      try {
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        user = new User({
          username: userData.username.trim(),
          email: invitation.email.toLowerCase().trim(),
          password: hashedPassword,
          noHp: userData.noHp || "",
          posisi: userData.posisi || "",
          departemen: userData.departemen || "",
          divisi: userData.divisi || "",
        });

        await user.save();
        console.log(`✅ User baru terdaftar: ${user.email}`);
      } catch (registerError) {
        console.error("Registration error:", registerError);
        return res.status(400).json({
          success: false,
          message: "Gagal mendaftarkan user baru",
          error: registerError.message,
        });
      }
    }

    // 7. Cek apakah user sudah menjadi member
    const memberExists = workspace.members.some(
      (m) => m.user && m.user._id.toString() === user._id.toString()
    );

    if (!memberExists) {
      // Tambahkan sebagai member
      await Workspace.findByIdAndUpdate(workspaceId, {
        $push: {
          members: {
            user: user._id,
            role: invitation.role || "member",
            joinedAt: new Date(),
          },
        },
        $pull: { pendingInvites: { token: token } },
      });

      // Update user workspaces
      await User.findByIdAndUpdate(user._id, {
        $push: {
          workspaces: {
            workspace: workspace._id,
            role: invitation.role || "member",
          },
        },
      });

      console.log(
        `✅ ${user.email} berhasil ditambahkan ke workspace ${workspace.nama}`
      );
    } else {
      // Jika sudah member, cukup hapus invitation
      await Workspace.findByIdAndUpdate(workspaceId, {
        $pull: { pendingInvites: { token: token } },
      });

      console.log(
        `ℹ️ ${user.email} sudah menjadi member workspace ${workspace.nama}`
      );
    }

    // 8. Berikan response sukses
    res.json({
      success: true,
      message: "Berhasil bergabung ke workspace",
      data: {
        workspaceId: workspace._id,
        workspaceName: workspace.nama,
        userId: user._id,
        username: user.username,
        email: user.email,
        role: invitation.role || "member",
        alreadyMember: memberExists,
      },
    });
  } catch (error) {
    console.error("❌ Error accepting workspace invite:", error);

    let errorMessage = "Terjadi kesalahan server";
    let statusCode = 500;

    if (error.name === "ValidationError") {
      errorMessage = "Data tidak valid";
      statusCode = 400;
    } else if (error.code === 11000) {
      errorMessage = "Email atau username sudah terdaftar";
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

export async function acceptInvite(req, res) {
  try {
    const { token } = req.query;
    const { username, password, noHp, posisi } = req.body;

    const workspace = await Workspace.findOne({
      "pendingInvites.token": token,
    });

    if (!workspace)
      return res.status(404).json({ message: "Token tidak valid" });

    const validation = validateInviteToken(workspace.pendingInvites, token);

    if (!validation.valid) {
      if (validation.expired) {
        workspace.pendingInvites = workspace.pendingInvites.filter(
          (inv) => inv.token !== token
        );
        await workspace.save();
      }
      return res.status(validation.expired ? 400 : 404).json({
        message: validation.message,
      });
    }

    const invitedEmail = validation.inviteData.email;
    const invitedRole = validation.inviteData.role || "member";

    const userResult = await findOrCreateUser(invitedEmail, {
      username,
      password,
      noHp,
      posisi,
    });

    if (!userResult.success) {
      return res.status(400).json({ message: userResult.message });
    }

    const userId = userResult.user._id;

    const isMember = workspace.members.some(
      (m) => m.user.toString() === userId.toString()
    );

    if (isMember) {
      return res.status(400).json({ message: "User sudah menjadi member" });
    }

    await Workspace.findByIdAndUpdate(
      workspace._id,
      {
        $push: {
          members: {
            user: userId,
            role: invitedRole,
          },
        },
        $pull: { pendingInvites: { token: token } },
      },
      { new: true }
    );

    await User.findByIdAndUpdate(userId, {
      $push: {
        workspaces: {
          workspace: workspace._id,
          role: invitedRole,
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: "Berhasil bergabung ke workspace",
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateMemberRole(req, res) {
  try {
    const { workspaceId, userId } = req.params;
    const { role } = req.body;
    const requesterId = req.user._id;

    const workspace = await Workspace.findById(workspaceId);

    if (!workspace)
      return res.status(404).json({ message: "Workspace tidak ditemukan" });

    if (workspace.owner.toString() !== requesterId.toString()) {
      return res
        .status(403)
        .json({ message: "Hanya owner yang dapat mengubah role" });
    }

    await Workspace.findOneAndUpdate(
      { _id: workspaceId, "members.user": userId },
      { $set: { "members.$.role": role } }
    );

    await User.findOneAndUpdate(
      { _id: userId, "workspaces.workspace": workspaceId },
      { $set: { "workspaces.$.role": role } }
    );

    res.status(200).json({
      success: true,
      message: "Role berhasil diupdate",
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function removeMember(req, res) {
  try {
    const { workspaceId, userId } = req.params;
    const requesterId = req.user._id;

    const workspace = await Workspace.findById(workspaceId);

    if (!workspace)
      return res.status(404).json({ message: "Workspace tidak ditemukan" });

    if (workspace.owner.toString() !== requesterId.toString()) {
      return res
        .status(403)
        .json({ message: "Hanya owner yang dapat menghapus member" });
    }

    await Workspace.findByIdAndUpdate(workspaceId, {
      $pull: { members: { user: userId } },
    });

    await User.findByIdAndUpdate(userId, {
      $pull: { workspaces: { workspace: workspaceId } },
    });

    res.status(200).json({
      success: true,
      message: "Member berhasil dihapus",
    });
  } catch (error) {
    return handleError(res, error);
  }
}
