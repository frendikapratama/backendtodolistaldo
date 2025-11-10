import Kuarter from "../models/Kuarter.js";
import Workspace from "../models/Workspace.js";
import Project from "../models/Project.js";
import Group from "../models/Group.js";
import Task from "../models/Task.js";
import Subtask from "../models/Subtask.js";
import { handleError } from "../utils/errorHandler.js";

export async function get(req, res) {
  try {
    const data = await Kuarter.find();
    res.status(200).json({
      success: true,
      message: "berhasil mengambil data",
      data,
    });
  } catch (error) {
    return handleError(error, res);
  }
}

export async function create(req, res) {
  try {
    const newKuarter = await Kuarter.create({
      nama: req.body.nama,
    });
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
    const { nama } = req.body;

    const updatedKuarter = await Kuarter.findByIdAndUpdate(
      KuarterId,
      { nama },
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
