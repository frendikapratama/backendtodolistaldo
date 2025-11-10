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
import { findOrCreateUser, addUserToWorkspace } from "../utils/userUtils.js";
import { sendWorkspaceInvitationEmail } from "../utils/emailUtils.js";
import { handleError } from "../utils/errorHandler.js";

export async function getWorkspace(req, res) {
  try {
    const data = await Workspace.find().populate("projects", "nama");

    res.status(200).json({
      success: true,
      message: "workspace berhasil dibuat",
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
        path: "members",
        select: "username email",
      });
    res.status(200).json({
      success: true,
      message: "workspace berhasil dibuat",
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
      members: [req.user._id],
      kuarter: kuarterId,
    });

    await Kuarter.findByIdAndUpdate(kuarterId, {
      $push: { workspace: newWorkspace._id },
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
    const { email } = req.body;
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
      if (!workspace.members.includes(existingUser._id)) {
        await addUserToWorkspace(existingUser._id, workspaceId);

        console.log(`✅ ${email} langsung ditambahkan sebagai member`);
        return res.status(200).json({
          success: true,
          message: "User sudah terdaftar dan ditambahkan ke workspace",
        });
      }

      return res
        .status(400)
        .json({ message: "User sudah menjadi anggota workspace" });
    }

    const inviteToken = generateInviteToken();
    workspace.pendingInvites.push(createInviteObject(email, inviteToken));
    await workspace.save();

    const inviteUrl = `http://localhost:5173/accept-workspace-invite?token=${inviteToken}`;

    await sendWorkspaceInvitationEmail({
      to: email,
      workspaceName: workspace.nama,
      inviteUrl,
      inviterName: workspace.owner.username,
    });

    res.status(200).json({
      success: true,
      message: "Undangan berhasil dikirim via email",
    });
  } catch (error) {
    return handleError(res, error);
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
    const userResult = await findOrCreateUser(invitedEmail, {
      username,
      password,
      noHp,
      posisi,
    });

    if (!userResult.success) {
      return res.status(400).json({ message: userResult.message });
    }

    if (!workspace.members.includes(userResult.user._id)) {
      await addUserToWorkspace(userResult.user._id, workspace._id);

      workspace.pendingInvites = workspace.pendingInvites.filter(
        (inv) => inv.token !== token
      );
      await workspace.save();

      return res.status(200).json({
        success: true,
        message: "Berhasil bergabung ke workspace",
      });
    } else {
      return res.status(400).json({ message: "User sudah menjadi member" });
    }
  } catch (error) {
    return handleError(res, error);
  }
}
