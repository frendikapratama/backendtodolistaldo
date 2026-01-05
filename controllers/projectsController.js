import Project from "../models/Project.js";
import Workspace from "../models/Workspace.js";
import Group from "../models/Group.js";
import { handleError } from "../utils/errorHandler.js";
import Task from "../models/Task.js";
import Kuarter from "../models/Kuarter.js";
import User from "../models/User.js";

export async function getProject(req, res) {
  try {
    const data = await Project.find()
      .populate("workspace", "nama")
      .populate("groups", "nama");
    res.status(200).json({
      success: true,
      message: "berhasil mengambil data",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createProject(req, res) {
  try {
    const { workspaceId } = req.params;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace not found",
      });
    }

    const project = await Project.create({
      ...req.body,
      workspace: workspaceId,
    });

    const defaultGroup = await Group.create({
      nama: "New Group",
      project: project._id,
    });

    project.groups.push(defaultGroup._id);
    await project.save();

    await Workspace.findByIdAndUpdate(workspaceId, {
      $push: { projects: project._id },
    });

    const populatedProject = await Project.findById(project._id).populate({
      path: "groups",
      populate: { path: "task" },
    });

    res.status(201).json({
      success: true,
      message: "Project created successfully",
      data: populatedProject,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateProject(req, res) {
  try {
    const { projectId } = req.params;
    const { workspaceId, ...updateData } = req.body;

    const oldProject = await Project.findById(projectId);

    if (!oldProject) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    if (workspaceId && workspaceId !== String(oldProject.workspace)) {
      await Workspace.findByIdAndUpdate(oldProject.workspace, {
        $pull: { projects: oldProject._id },
      });

      await Workspace.findByIdAndUpdate(workspaceId, {
        $push: { projects: oldProject._id },
      });
    }

    updateData.workspace = workspaceId || oldProject.workspace;
    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      updateData,
      {
        new: true,
      }
    ).populate("groups");

    res.status(200).json({
      success: true,
      message: "Project updated successfully",
      data: updatedProject,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function deleteProject(req, res) {
  try {
    const { projectId } = req.params;
    const projectRef = await Project.findById(projectId).select("workspace");

    if (!projectRef) {
      return res.status(404).json({
        success: false,
        message: "Project tidak ditemukan",
      });
    }

    await Group.deleteMany({ project: projectId });

    await Workspace.findByIdAndUpdate(projectRef.workspace, {
      $pull: { projects: projectId },
    });

    await Project.findByIdAndDelete(projectId);

    res.status(200).json({
      success: true,
      message: "Project dan semua group terkait berhasil dihapus",
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getProjectById(req, res) {
  try {
    const { projectId } = req.params;

    const project = await Project.findById(projectId).populate(
      "groups",
      "nama"
    );
    res.status(200).json({
      success: true,
      message: "berhasil mengambil data",
      data: project,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getProjectList(req, res) {
  try {
    const userId = req.user._id;
    if(!userId){
      return res.status(400).json({
        success: false,
        message: "Error User ID not Found"
      })
    }
      const taskWithUser = await Task.find({ pic: userId })
        .select('groups')
        .lean()
      
      if(taskWithUser.length === 0){
        return res.json({
          success: true,
          message: "User hasnt been assign to any task",
          project: [],
        })
      }
      const groupIds = [...new Set(
        taskWithUser.flatMap(task => task.groups.map(g => String(g)))
      )]
      const groups = await Group.find({ _id: {$in: groupIds}})
        .select('_id name project')
        .lean()
      const projectIds = [...new Set(groups.map(g => String(g.project)))]
      const projects = await Project.find({ _id: {$in: projectIds} })
        .select('_id nama')
        .lean()
      const projectWithProgress = await Promise.all(
        projects.map(async (project) => {
          const projectGroups = await Group.find({ project: project._id })
          const projectGroupIds = projectGroups.map((g) => g._id)
          const allTasks = await Task.find({ groups: {$in: projectGroupIds }})
            .select('status pic groups')
            .lean()
          const totalTask = allTasks.length;
          const doneTask = allTasks.filter((t) => t.status === "Done").length;
          const progress = totalTask === 0 ? 0 : Math.round((doneTask / totalTask) * 100);
          const picSet = new Set();
          allTasks.forEach((task) => {
            task.pic?.forEach((p) => picSet.add(String(p)))
          })
          const uniquePicIds = Array.from(picSet)
          const picDetails = await User.find({ _id: uniquePicIds })
            .select('_id nama email')
            .lean()
          
          return {
            projectId: project._id,
            namaProject: project.nama,
            pic: picDetails,
            progress,
            totalTask,
          }
        })
      );
      res.json({
        success: true,
        userId,
        project: projectWithProgress
      })
  } catch (error) {
    return handleError(res, error);
  }
}
