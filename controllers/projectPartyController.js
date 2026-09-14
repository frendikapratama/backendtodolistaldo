import mongoose from "mongoose";
import Project from "../models/Project.js";
import Party from "../models/Party.js";
import ProjectParty from "../models/ProjectParty.js";
import { handleError } from "../utils/errorHandler.js";

const isValidId = (value) => mongoose.isValidObjectId(value);

export async function addProjectParty(req, res) {
  try {
    const { projectId } = req.params;
    const { party, role } = req.body;

    if (!isValidId(projectId) || !isValidId(party)) {
      return res.status(400).json({
        success: false,
        message: "Invalid project or party id",
      });
    }

    const [projectExists, partyExists] = await Promise.all([
      Project.exists({ _id: projectId }),
      Party.exists({ _id: party }),
    ]);

    if (!projectExists) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    if (!partyExists) {
      return res.status(404).json({
        success: false,
        message: "Party not found",
      });
    }

    if (!["client", "vendor"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be either client or vendor",
      });
    }

    const existing = await ProjectParty.exists({ project: projectId, party });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Party is already assigned to this project",
      });
    }

    const projectParty = await ProjectParty.create({
      project: projectId,
      party,
      role,
    });

    await projectParty.populate("party", "name email phone");

    return res.status(201).json({
      success: true,
      message: "Party added to project successfully",
      data: projectParty,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateProjectParty(req, res) {
  try {
    const { projectId, projectPartyId } = req.params;
    const { role } = req.body;

    if (!isValidId(projectId) || !isValidId(projectPartyId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid project or project party id",
      });
    }

    if (!["client", "vendor"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be either client or vendor",
      });
    }

    const projectExists = await Project.exists({ _id: projectId });
    if (!projectExists) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const projectParty = await ProjectParty.findOneAndUpdate(
      { _id: projectPartyId, project: projectId },
      { role },
      { new: true, runValidators: true },
    ).populate("party", "name email phone");

    if (!projectParty) {
      return res.status(404).json({
        success: false,
        message: "Project party not found for this project",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Project party updated successfully",
      data: projectParty,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function deleteProjectParty(req, res) {
  try {
    const { projectId, projectPartyId } = req.params;

    if (!isValidId(projectId) || !isValidId(projectPartyId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid project or project party id",
      });
    }

    const projectExists = await Project.exists({ _id: projectId });
    if (!projectExists) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const projectParty = await ProjectParty.findOneAndDelete({
      _id: projectPartyId,
      project: projectId,
    });

    if (!projectParty) {
      return res.status(404).json({
        success: false,
        message: "Project party not found for this project",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Project party deleted successfully",
      data: projectParty,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
