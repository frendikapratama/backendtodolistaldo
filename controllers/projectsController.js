import mongoose from "mongoose";
import Project from "../models/Project.js";
import Workspace from "../models/Workspace.js";
import Group from "../models/Group.js";
import { handleError } from "../utils/errorHandler.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import Subtask from "../models/Subtask.js";
import Comment from "../models/Comment.js";
import Party from "../models/Party.js";
import ProjectParty from "../models/ProjectParty.js";

const normalizeProjectStatus = (status) => {
  const normalizedStatus = String(status || "draft")
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");

  const statusAliases = {
    "on hold": "hold",
  };

  return statusAliases[normalizedStatus] || normalizedStatus;
};

export async function getProject(req, res) {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      status,
      projectManager,
      sites,
      divisionId,
    } = req.query;

    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 10, 1), 100);

    const filter = {
      ...(search.trim() && {
        nama: { $regex: search.trim(), $options: "i" },
      }),
      ...(status && { status }),
      ...(projectManager && { projectManager }),
      ...(sites && { sites: { $in: sites.split(",") } }),
      ...(divisionId && {
        divisionId: { $in: divisionId.split(",") },
      }),
    };

    const summaryFilter = {
      ...filter,
      ...(projectManager &&
        mongoose.isValidObjectId(projectManager) && {
          projectManager: new mongoose.Types.ObjectId(projectManager),
        }),
      ...(divisionId && {
        divisionId: {
          $in: divisionId
            .split(",")
            .filter(mongoose.isValidObjectId)
            .map((id) => new mongoose.Types.ObjectId(id)),
        },
      }),
    };

    const [data, total, summaryResult] = await Promise.all([
      Project.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("groups", "nama")
        .populate("projectManager", "username email photo divisi")
        .populate("divisionId", "nama")
        .populate({
          path: "parties",
          populate: {
            path: "party",
            select: "name email phone address",
          },
        }),

      Project.countDocuments(filter),

      Project.aggregate([
        { $match: summaryFilter },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const summary = {
      total,
      draft: 0,
      planning: 0,
      "in progress": 0,
      hold: 0,
      completed: 0,
      cancelled: 0,
    };

    summaryResult.forEach(({ _id, count }) => {
      const normalizedStatus = normalizeProjectStatus(_id);

      if (normalizedStatus in summary) {
        summary[normalizedStatus] += count;
      }
    });

    res.status(200).json({
      success: true,
      message: "Berhasil mengambil data project",
      data,
      summary,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createProject(req, res) {
  let session;

  try {
    const { parties = [], ...projectData } = req.body;

    if (!Array.isArray(parties)) {
      return res.status(400).json({
        success: false,
        message: "parties must be an array",
      });
    }

    const hasInvalidParty = parties.some(
      (party) =>
        !party ||
        !mongoose.isValidObjectId(party.party) ||
        !["client", "vendor"].includes(party.role),
    );
    const partyIds = parties.map((party) => party.party);

    if (hasInvalidParty || new Set(partyIds).size !== partyIds.length) {
      return res.status(400).json({
        success: false,
        message:
          "Each party must contain a valid party and role; duplicate parties are not allowed",
      });
    }

    const partyCount = await Party.countDocuments({ _id: { $in: partyIds } });
    if (partyCount !== partyIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more parties do not exist",
      });
    }

    session = await mongoose.startSession();
    let project;

    await session.withTransaction(async () => {
      [project] = await Project.create([projectData], { session });

      const [defaultGroup] = await Group.create(
        [{ nama: "New Group", project: project._id }],
        { session },
      );

      project.groups.push(defaultGroup._id);
      await project.save({ session });

      if (parties.length > 0) {
        await ProjectParty.insertMany(
          parties.map(({ party, role }) => ({
            project: project._id,
            party,
            role,
          })),
          { session },
        );
      }
    });

    const populatedProject = await Project.findById(project._id)
      .populate({
        path: "groups",
        populate: { path: "task" },
      })
      .lean();
    const projectParties = await ProjectParty.find({ project: project._id })
      .populate("party", "name email phone")
      .lean();

    return res.status(201).json({
      success: true,
      message: "Project created successfully",
      data: { ...populatedProject, parties: projectParties },
    });
  } catch (error) {
    return handleError(res, error);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}

export async function updateProject(req, res) {
  try {
    const { projectId } = req.params;

    const {
      projectManager,
      divisionId,
      groups,
      nama,
      startedAt,
      dueDate,
      status,
      sites,
      parties,
    } = req.body;

    // Cari project
    const oldProject = await Project.findById(projectId);

    if (!oldProject) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Validasi parties jika dikirim
    if (parties !== undefined) {
      if (!Array.isArray(parties)) {
        return res.status(400).json({
          success: false,
          message: "parties must be an array",
        });
      }

      const hasInvalidParty = parties.some(
        (party) =>
          !party ||
          !mongoose.isValidObjectId(party.party) ||
          !["client", "vendor"].includes(party.role),
      );
      const partyIds = parties.map((party) => party.party);

      if (hasInvalidParty || new Set(partyIds).size !== partyIds.length) {
        return res.status(400).json({
          success: false,
          message:
            "Each party must contain a valid party and role; duplicate parties are not allowed",
        });
      }

      if (partyIds.length > 0) {
        const partyCount = await Party.countDocuments({
          _id: { $in: partyIds },
        });
        if (partyCount !== partyIds.length) {
          return res.status(400).json({
            success: false,
            message: "One or more parties do not exist",
          });
        }
      }

      // Sinkronkan ProjectParty untuk project ini
      await ProjectParty.deleteMany({ project: projectId });
      if (parties.length > 0) {
        await ProjectParty.insertMany(
          parties.map(({ party, role }) => ({
            project: projectId,
            party,
            role,
          })),
        );
      }
    }

    // Field yang boleh di-update
    const updateData = {};

    if (nama !== undefined) {
      updateData.nama = nama;
    }

    if (startedAt !== undefined) {
      updateData.startedAt = startedAt;
    }

    if (dueDate !== undefined) {
      updateData.dueDate = dueDate;
    }

    if (status !== undefined) {
      updateData.status = status;
    }

    if (projectManager !== undefined) {
      updateData.projectManager = projectManager;
    }

    if (divisionId !== undefined) {
      updateData.divisionId = divisionId;
    }

    if (groups !== undefined) {
      updateData.groups = groups;
    }

    if (sites !== undefined) {
      updateData.sites = sites;
    }

    // Update project
    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      updateData,
      {
        new: true,
        runValidators: true,
      },
    )
      .populate("groups", "nama")
      .populate("projectManager", "username email photo")
      .populate("divisionId", "nama")
      .populate({
        path: "parties",
        populate: {
          path: "party",
          select: "name email phone address",
        },
      });

    return res.status(200).json({
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

    // 1. Cari semua group milik project
    const groups = await Group.find({ project: projectId }).select("_id");
    const groupIds = groups.map((g) => g._id);

    // 2. Cari semua task di dalam group tersebut
    const tasks = await Task.find({
      groups: { $in: groupIds },
    }).select("_id");

    const taskIds = tasks.map((t) => t._id);

    // 3. Hapus semua subtask
    await Subtask.deleteMany({
      task: { $in: taskIds },
    });

    // 4. Hapus semua comment
    await Comment.deleteMany({
      task: { $in: taskIds },
    });

    // 5. Hapus semua task
    await Task.deleteMany({
      groups: { $in: groupIds },
    });

    // 6. Hapus semua group
    await Group.deleteMany({
      project: projectId,
    });

    // 7. Hapus hubungan Project <-> Party
    await ProjectParty.deleteMany({
      project: projectId,
    });

    // 8. Hapus project
    await Project.findByIdAndDelete(projectId);

    return res.status(200).json({
      success: true,
      message:
        "Project dan semua data terkait (group, task, subtask, comment, project party) berhasil dihapus",
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getProjectById(req, res) {
  try {
    const { projectId } = req.params;

    const project = await Project.findById(projectId)
      .populate("groups", "nama")
      .lean();

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    project.parties = await ProjectParty.find({ project: projectId })
      .populate("party", "name email phone")
      .select("party role")
      .lean();

    res.status(200).json({
      success: true,
      message: "Project retrieved successfully",
      data: project,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getProjectList(req, res) {
  try {
    const userId = req.user._id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Error User ID not Found",
      });
    }

    const taskWithUser = await Task.find({ pic: userId })
      .select("groups")
      .lean();

    if (taskWithUser.length === 0) {
      return res.json({
        success: true,
        message: "User hasn't been assigned to any task",
        project: [],
      });
    }

    const groupIds = [
      ...new Set(
        taskWithUser.flatMap((task) => task.groups.map((g) => String(g))),
      ),
    ];

    const groups = await Group.find({ _id: { $in: groupIds } })
      .select("_id name project")
      .lean();

    const projectIds = [...new Set(groups.map((g) => String(g.project)))];

    const projects = await Project.find({ _id: { $in: projectIds } })
      .select("_id nama workspace")
      .populate("workspace", "_id nama")
      .lean();

    const projectWithProgress = await Promise.all(
      projects.map(async (project) => {
        const projectGroups = await Group.find({ project: project._id });
        const projectGroupIds = projectGroups.map((g) => g._id);

        const allTasks = await Task.find({ groups: { $in: projectGroupIds } })
          .select("status pic groups")
          .lean();

        // Count tasks by status
        const statusCount = {
          todo: 0,
          "in progress": 0,
          "done-in-review": 0,
          done: 0,
          hold: 0,
          block: 0,
        };

        allTasks.forEach((task) => {
          const status = task.status?.toLowerCase();
          if (status === "to do") {
            statusCount.todo++;
          } else if (status === "in progress") {
            statusCount["in progress"]++;
          } else if (status === "done-in review") {
            statusCount["done-in-review"]++;
          } else if (status === "done") {
            statusCount.done++;
          } else if (status === "hold") {
            statusCount.hold++;
          } else if (status === "block" || status === "blocked") {
            statusCount.block++;
          }
        });

        const totalTask = allTasks.length;
        const doneTask = statusCount.done;
        const progress =
          totalTask === 0 ? 0 : Math.round((doneTask / totalTask) * 100);

        const picSet = new Set();
        allTasks.forEach((task) => {
          task.pic?.forEach((p) => picSet.add(String(p)));
        });
        const uniquePicIds = Array.from(picSet);

        const picDetails = await User.find({ _id: uniquePicIds })
          .select("_id nama email")
          .lean();

        return {
          projectId: project._id,
          namaProject: project.nama,
          pic: picDetails,
          progress,
          totalTask,
          taskStatus: statusCount, // Added status breakdown
          workspace: project.workspace,
        };
      }),
    );

    res.json({
      success: true,
      userId,
      project: projectWithProgress,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
