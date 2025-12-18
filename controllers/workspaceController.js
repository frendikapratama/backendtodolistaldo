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
      message:
        "Workspace, project, group, task, and subtask deleted successfully",
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
        .json({ message: "Only the owner can invite members" });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      const isMember = workspace.members.some(
        (m) => m.user.toString() === existingUser._id.toString()
      );

      if (isMember) {
        return res
          .status(400)
          .json({ message: "User is already a member of this workspace" });
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
        message: "user has been registered and added to the workspace",
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
      message: "Invitation email sent successfully",
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
        message: "Divisiion not found",
      });
    }

    const invitation = workspace.pendingInvites.find(
      (inv) => inv.token === token
    );

    if (!invitation) {
      return res.status(400).json({
        success: false,
        message: "Invitation token is invalid or expired",
      });
    }

    const tokenAge = Date.now() - invitation.createdAt.getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    if (tokenAge > sevenDays) {
      return res.status(400).json({
        success: false,
        message: "Token expired",
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
      message: "Internal server error",
    });
  }
}

export async function acceptWorkspaceInvite(req, res) {
  try {
    const { token } = req.query;
    const { username, password, noHp, posisi } = req.body;

    const workspace = await Workspace.findOne({
      "pendingInvites.token": token,
    });

    if (!workspace) return res.status(404).json({ message: "Token invalid" });

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
      return res
        .status(400)
        .json({ message: "User is already a member of this division" });
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
      message: "Successfully joined the division",
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
      return res.status(404).json({ message: "Division not found" });

    if (workspace.owner.toString() !== requesterId.toString()) {
      return res
        .status(403)
        .json({ message: "Only the owner can change roles" });
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
      return res.status(404).json({ message: "Division not found" });

    if (workspace.owner.toString() !== requesterId.toString()) {
      return res
        .status(403)
        .json({ message: "Only the owner can remove members" });
    }

    await Workspace.findByIdAndUpdate(workspaceId, {
      $pull: { members: { user: userId } },
    });

    await User.findByIdAndUpdate(userId, {
      $pull: { workspaces: { workspace: workspaceId } },
    });

    res.status(200).json({
      success: true,
      message: "Member successfully removed",
    });
  } catch (error) {
    return handleError(res, error);
  }
}
