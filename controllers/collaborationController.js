import CollaborationRequest from "../models/CollaborationRequest.js";
import Project from "../models/Project.js";
import Workspace from "../models/Workspace.js";

export const sendCollaborationRequest = async (req, res) => {
  try {
    const { projectId, fromWorkspaceId, toWorkspaceId } = req.body;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });

    const fromWorkspace = await Workspace.findById(fromWorkspaceId);
    const toWorkspace = await Workspace.findById(toWorkspaceId);

    if (!fromWorkspace || !toWorkspace) {
      return res.status(404).json({ message: "Division not found" });
    }

    if (project.workspace.toString() !== fromWorkspaceId) {
      return res.status(403).json({
        message: "the project does not belong to the sending division",
      });
    }

    if (project.otherWorkspaces?.includes(toWorkspaceId)) {
      return res.status(400).json({
        message:
          "This project is already collaborated with the target division",
      });
    }

    const existing = await CollaborationRequest.findOne({
      project: projectId,
      fromWorkspace: fromWorkspaceId,
      toWorkspace: toWorkspaceId,
      status: "pending",
    });
    if (existing)
      return res.status(400).json({ message: "Request already been send" });

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

    // Ambil request dari middleware (sudah divalidasi)
    const request =
      req.collaborationRequest ||
      (await CollaborationRequest.findById(requestId));

    if (!request)
      return res.status(404).json({ message: "Request tidak ditemukan" });

    request.status = "approved";
    await request.save();

    await Project.findByIdAndUpdate(request.project, {
      $addToSet: { otherWorkspaces: request.toWorkspace },
    });

    res.json({ success: true, message: "Collaboration approved" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const rejectCollaboration = async (req, res) => {
  try {
    const { requestId } = req.params;

    // Ambil request dari middleware (sudah divalidasi)
    const request =
      req.collaborationRequest ||
      (await CollaborationRequest.findById(requestId));

    if (!request)
      return res.status(404).json({ message: "Request tidak ditemukan" });

    request.status = "rejected";
    await request.save();

    res.json({ success: true, message: "Collaboration rejected" });
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
