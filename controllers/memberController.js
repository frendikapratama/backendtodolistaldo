import Workspace from "../models/Workspace.js";
import { handleError } from "../utils/errorHandler.js";
import Project from "../models/Project.js";

export async function getMemberWorkspace(req, res) {
  try {
    const { workspaceId } = req.params;

    const workspace = await Workspace.findById(workspaceId)
      .populate("owner", "username email role photo")
      .populate("members.user", "username email departemen divisi posisi photo");

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const data = {
      owner: workspace.owner,
      members: workspace.members,
      totalMembers: workspace.members.length,
    };
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getProjectTasksWithPics(req, res) {
  try {
    const { projectId } = req.params;

    const project = await Project.findById(projectId)
      .populate("workspace", "members")
      .populate({
        path: "groups",
        populate: {
          path: "task",
          populate: {
            path: "pic",
            select: "username email",
          },
        },
      });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project tidak ditemukan",
      });
    }

    const allTasks = project.groups.reduce((acc, group) => {
      return [...acc, ...group.task];
    }, []);

    const allPics = allTasks.reduce((acc, task) => {
      task.pic.forEach((pic) => {
        if (!acc.find((p) => p._id.toString() === pic._id.toString())) {
          acc.push(pic);
        }
      });
      return acc;
    }, []);

    const data = {
      membersByProject: allPics,
      totalPics: allPics.length,
    };

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
