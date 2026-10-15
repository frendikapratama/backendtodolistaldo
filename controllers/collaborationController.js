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

    const allOwnedProjects = await Project.find({ workspace: workspaceId })
      .select(
        "nama createdAt startedAt dueDate status projectManager otherWorkspaces",
      )
      .populate("otherWorkspaces", "nama");

    // Dapatkan project ID yang benar-benar memiliki collaboration request approved
    const approvedCollabs = await CollaborationRequest.find({
      fromWorkspace: workspaceId,
      status: "approved",
    }).select("project toWorkspace");

    const approvedMap = new Map();
    approvedCollabs.forEach((c) => {
      const pId = String(c.project);
      if (!approvedMap.has(pId)) approvedMap.set(pId, new Set());
      approvedMap.get(pId).add(String(c.toWorkspace));
    });

    const owned = [];
    const ownedButCollaborated = [];

    for (const project of allOwnedProjects) {
      const validCollabWorkspaces = (project.otherWorkspaces || []).filter(
        (ws) => {
          const wsId = String(ws._id || ws);
          return (
            wsId !== String(workspaceId) &&
            approvedMap.get(String(project._id))?.has(wsId)
          );
        },
      );

      // Jika ada otherWorkspaces di DB tanpa request collaboration approved, bersihkan
      if (
        (project.otherWorkspaces || []).length > 0 &&
        validCollabWorkspaces.length !== project.otherWorkspaces.length
      ) {
        await Project.findByIdAndUpdate(project._id, {
          otherWorkspaces: validCollabWorkspaces.map((w) => w._id || w),
        });
        project.otherWorkspaces = validCollabWorkspaces;
      }

      if (validCollabWorkspaces.length > 0) {
        ownedButCollaborated.push(project);
      } else {
        owned.push(project);
      }
    }

    const collaboratedFromOthers = await Project.find({
      otherWorkspaces: workspaceId,
    })
      .select(
        "nama createdAt startedAt dueDate status projectManager workspace",
      )
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
