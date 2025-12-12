import Kuarter from "../models/Kuarter.js";
import Workspace from "../models/Workspace.js";
import Project from "../models/Project.js";
import Group from "../models/Group.js";
import Task from "../models/Task.js";
import Subtask from "../models/Subtask.js";
import { handleError } from "../utils/errorHandler.js";

export async function get(req, res) {
  try {
    const kuarters = await Kuarter.find();

    const kuartersWithTaskStats = await Promise.all(
      kuarters.map(async (kuarter) => {
        const workspaces = await Workspace.find({ kuarter: kuarter._id });
        const workspaceIds = workspaces.map((w) => w._id);

        const projects = await Project.find({
          $or: [
            { workspace: { $in: workspaceIds } },
            { otherWorkspaces: { $in: workspaceIds } },
          ],
        });
        const projectIds = projects.map((p) => p._id);

        const groups = await Group.find({ project: { $in: projectIds } });
        const groupIds = groups.map((g) => g._id);

        const tasks = await Task.find({ groups: { $in: groupIds } });

        // Hitung berdasarkan status
        const tasksByStatus = tasks.reduce((acc, task) => {
          const status = task.status || "Unknown";
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        }, {});

        return {
          ...kuarter.toObject(),
          totalTask: tasks.length,
          ...tasksByStatus, // Spread status langsung ke object
        };
      })
    );

    res.status(200).json({
      success: true,
      message: "berhasil mengambil data",
      data: kuartersWithTaskStats,
    });
  } catch (error) {
    return handleError(error, res);
  }
}

export async function create(req, res) {
  try {
    const newKuarter = await Kuarter.create(req.body);
    res.status(201).json({
      success: true,
      message: "task created successfully",
      data: newKuarter,
    });
  } catch (error) {
    return handleError(error, res);
  }
}

export async function edit(req, res) {
  try {
    const { KuarterId } = req.params;

    const updatedKuarter = await Kuarter.findByIdAndUpdate(
      KuarterId,
      req.body,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: "berhasil update kuarter",
      data: updatedKuarter,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
export async function deleteKuarter(req, res) {
  try {
    const { KuarterId } = req.params;

    const kuarter = await Kuarter.findById(KuarterId);
    if (!kuarter) {
      return res.status(404).json({
        success: false,
        message: "Kuarter tidak ditemukan",
      });
    }

    const workspaces = await Workspace.find({ kuarter: KuarterId });

    for (const workspace of workspaces) {
      const projects = await Project.find({ workspace: workspace._id });

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
      await Project.deleteMany({ workspace: workspace._id });
    }
    await Workspace.deleteMany({ kuarter: KuarterId });
    const deletedKuarter = await Kuarter.findByIdAndDelete(KuarterId);

    res.status(200).json({
      success: true,
      message: "Kuarter dan semua data terkait berhasil dihapus",
      data: deletedKuarter,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getById(req, res) {
  try {
    const { KuarterId } = req.params;
    const data = await Kuarter.findById(KuarterId).populate(
      "workspace",
      "nama"
    );
    res.status(200).json({
      success: true,
      message: "kuarter berhasil ambil",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
