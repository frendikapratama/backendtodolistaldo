import CollaborationRequest from "../models/CollaborationRequest.js";
import Project from "../models/Project.js";
import Workspace from "../models/Workspace.js";

export const sendCollaborationRequest = async (req, res) => {
  try {
    const { projectId, fromWorkspaceId, toWorkspaceId } = req.body;

    const project = await Project.findById(projectId);
    if (!project)
      return res.status(404).json({ message: "Project tidak ditemukan" });

    const fromWorkspace = await Workspace.findById(fromWorkspaceId);
    const toWorkspace = await Workspace.findById(toWorkspaceId);

    if (!fromWorkspace || !toWorkspace) {
      return res.status(404).json({ message: "Workspace tidak ditemukan" });
    }

    if (project.workspace.toString() !== fromWorkspaceId) {
      return res.status(403).json({
        message: "Project bukan milik workspace pengirim",
      });
    }

    if (project.otherWorkspaces?.includes(toWorkspaceId)) {
      return res.status(400).json({
        message: "Workspace sudah berkolaborasi di project ini",
      });
    }

    const existing = await CollaborationRequest.findOne({
      project: projectId,
      fromWorkspace: fromWorkspaceId,
      toWorkspace: toWorkspaceId,
      status: "pending",
    });
    if (existing)
      return res.status(400).json({ message: "Request sudah dikirim" });

    const request = await CollaborationRequest.create({
      project: projectId,
      fromWorkspace: fromWorkspaceId,
      toWorkspace: toWorkspaceId,
      createdBy: req.user?._id,
    });

    res.status(201).json({ success: true, request });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const approveCollaboration = async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await CollaborationRequest.findById(requestId);
    if (!request)
      return res.status(404).json({ message: "Request tidak ditemukan" });

    // Verifikasi user adalah member dari workspace tujuan
    // const workspace = await Workspace.findById(request.toWorkspace);
    // if (!workspace) {
    //   return res.status(404).json({ message: "Workspace tidak ditemukan" });
    // }

    // const isMember =
    //   workspace.owner.equals(req.user._id) ||
    //   workspace.members.some((m) => m.equals(req.user._id));

    // if (!isMember) {
    //   return res.status(403).json({
    //     message: "Anda tidak memiliki akses ke workspace ini",
    //   });
    // }

    request.status = "approved";
    await request.save();

    await Project.findByIdAndUpdate(request.project, {
      $addToSet: { otherWorkspaces: request.toWorkspace },
    });

    res.json({ success: true, message: "Kolaborasi disetujui" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const rejectCollaboration = async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await CollaborationRequest.findById(requestId);
    if (!request)
      return res.status(404).json({ message: "Request tidak ditemukan" });

    const workspace = await Workspace.findById(request.toWorkspace);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace tidak ditemukan" });
    }

    // const isMember =
    //   workspace.owner.equals(req.user._id) ||
    //   workspace.members.some((m) => m.equals(req.user._id));

    // if (!isMember) {
    //   return res.status(403).json({
    //     message: "Anda tidak memiliki akses ke workspace ini",
    //   });
    // }

    request.status = "rejected";
    await request.save();

    res.json({ success: true, message: "Kolaborasi ditolak" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getCollaborationRequests = async (req, res) => {
  try {
    const { workspaceId, type } = req.query;

    const filter = {
      ...(type === "incoming"
        ? { toWorkspace: workspaceId }
        : { fromWorkspace: workspaceId }),
      ...(req.query.status && { status: req.query.status }),
    };

    const requests = await CollaborationRequest.find(filter)
      .populate("project", "nama description")
      .populate("fromWorkspace", "nama")
      .populate("toWorkspace", "nama")
      .populate("createdBy", "username email")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: requests });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getWorkspaceProjects = async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const owned = await Project.find({
      workspace: workspaceId,
      $or: [
        { otherWorkspaces: { $exists: false } },
        { otherWorkspaces: { $size: 0 } },
      ],
    }).select("nama description createdAt otherWorkspaces");

    const ownedButCollaborated = await Project.find({
      workspace: workspaceId,
      otherWorkspaces: { $exists: true, $ne: [] },
    })
      .select("nama description createdAt otherWorkspaces")
      .populate("otherWorkspaces", "nama");

    const collaboratedFromOthers = await Project.find({
      otherWorkspaces: workspaceId,
    })
      .select("nama description createdAt workspace")
      .populate("workspace", "nama");

    res.json({
      success: true,
      data: {
        owned,
        ownedButCollaborated,
        collaboratedFromOthers,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
