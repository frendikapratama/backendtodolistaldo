import Task from "../models/Task.js";
import mongoose from "mongoose";
import {
  calculateDuration,
  getCompletionStatus,
  getCompletionStatusFromNote,
} from "../utils/reportUtils.js";

export const getTaskReports = async (req, res) => {
  try {
    const {
      workspaceId,
      projectId,
      groupId,
      status,
      priority,
      startDate,
      endDate,
      search,
      page,
      limit,
    } = req.query;

    // BUILD FILTERS
    const findFilter = {};
    const aggFilter = {};

    // Workspace Filter
    if (workspaceId) {
      findFilter.workspace = workspaceId;
      aggFilter.workspace = new mongoose.Types.ObjectId(workspaceId);
    }

    // Project Filter
    if (projectId) {
      findFilter.project = projectId;
      aggFilter.project = new mongoose.Types.ObjectId(projectId);
    }

    // Group Filter
    if (groupId) {
      findFilter.groups = groupId;
      aggFilter.groups = new mongoose.Types.ObjectId(groupId);
    }

    // Status Filter
    if (status && status !== "all") {
      findFilter.status = status;
      aggFilter.status = status;
    }

    // Priority Filter
    if (priority && priority !== "all") {
      findFilter.priority = priority;
      aggFilter.priority = priority;
    }

    // Date Range Filter
    if (startDate || endDate) {
      findFilter.start_date = {};
      aggFilter.start_date = {};

      if (startDate) {
        const start = new Date(startDate);
        findFilter.start_date.$gte = start;
        aggFilter.start_date.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        findFilter.start_date.$lte = end;
        aggFilter.start_date.$lte = end;
      }
    }

    // Search Filter
    if (search && search.trim() !== "") {
      const searchRegex = { $regex: search.trim(), $options: "i" };
      findFilter.nama = searchRegex;
      aggFilter.nama = searchRegex;
    }

    // PAGINATION PARAMETERS
    const pageNum = parseInt(page) || 1;
    const limitNum = limit === "all" ? 0 : parseInt(limit) || 25;
    const skipNum = (pageNum - 1) * limitNum;

    const summaryAggregate = await Task.aggregate([
      { $match: aggFilter },
      {
        $lookup: {
          from: "subtasks",
          localField: "subtask",
          foreignField: "_id",
          as: "subtasksData",
        },
      },
      {
        $project: {
          _id: 1,
          status: 1,
          due_date: 1,
          finish_date: 1,
          note: 1,
          "subtasksData.status": 1,
          "subtasksData.due_date": 1,
          "subtasksData.finish_date": 1,
          "subtasksData.note": 1,
        },
      },
    ]);

    let totalTask = 0;
    let totalSubtask = 0;
    let done = 0;
    let late = 0;
    let ontime = 0;
    let early = 0;
    let unfinished = 0;

    for (const t of summaryAggregate) {
      totalTask++;
      if (t.status === "Done" || t.status === "Done-In review") done++;

      const compStatus = getCompletionStatusFromNote(t.note);
      if (compStatus === "LATE") late++;
      else if (compStatus === "ONTIME") ontime++;
      else if (compStatus === "EARLY") early++;

      for (const sub of t.subtasksData || []) {
        totalSubtask++;
        if (sub.status === "Done" || sub.status === "Done-In review") done++;

        const subCompStatus = getCompletionStatusFromNote(sub.note);
        if (subCompStatus === "LATE") {
          late++;
        } else if (subCompStatus === "ONTIME") {
          ontime++;
        } else if (subCompStatus === "EARLY") {
          early++;
        } else {
          unfinished++;
        }
      }
    }

    const summary = {
      total: totalTask + totalSubtask,
      totalTask,
      totalSubtask,
      done,
      late,
      ontime,
      early,
      unfinished,
    };

    // PAGINATED DATA RETRIEVAL
    const totalTasks = await Task.countDocuments(findFilter);
    
    let tasksQuery = Task.find(findFilter)
      .populate({
        path: "workspace",
        populate: {
          path: "kuarter",
        },
      })
      .populate("project", "nama")
      .populate("groups", "nama")
      .populate("pic", "nama email username")
      .populate({
        path: "subtask",
        populate: {
          path: "pic",
          select: "nama email username",
        },
      })
      .sort({
        createdAt: -1,
      });

    if (limit !== "all" && req.query.export !== "true") {
      tasksQuery = tasksQuery.skip(skipNum).limit(limitNum);
    }

    const tasks = await tasksQuery.lean();

    const reports = [];

    for (const task of tasks) {
      const groupName = task.groups?.map((g) => g.nama).join(", ") || "-";
      const picNames = task.pic?.map((p) => p.nama || p.username).join(", ") || "-";

      // TASK ROW
      reports.push({
        level: 0,
        itemType: "TASK",
        kuarter: task.workspace?.kuarter?.nama || "-",
        departemen: task.workspace?.kuarter?.departemen || "-",
        workspace: task.workspace?.nama || "-",
        group: groupName,
        project: task.project?.nama || "-",
        taskId: task._id,
        taskName: task.nama,
        subtaskId: null,
        subtaskName: null,
        pic: picNames,
        type: task.type || "-",
        status: task.status || "-",
        priority: task.priority || "-",
        scale: task.scale || "-",
        startDate: task.start_date,
        dueDate: task.due_date,
        finishDate: task.finish_date,
        durationStartToEnd: calculateDuration(task.start_date, task.due_date),
        durationStartToFinish: calculateDuration(task.start_date, task.finish_date),
        durationDueToFinish: calculateDuration(task.due_date, task.finish_date),
        completionStatus: task.note ,
      });

      // SUBTASK ROWS
      for (const subtask of task.subtask || []) {
        const subtaskPicNames = subtask.pic?.map((p) => p.nama || p.username).join(", ") || "-";

        reports.push({
          level: 1,
          itemType: "SUBTASK",
          kuarter: task.workspace?.kuarter?.nama || "-",
          departemen: task.workspace?.kuarter?.departemen || "-",
          workspace: task.workspace?.nama || "-",
          group: groupName,
          project: task.project?.nama || "-",
          taskId: task._id,
          taskName: task.nama,
          subtaskId: subtask._id,
          subtaskName: subtask.nama,
          pic: subtaskPicNames,
          type: subtask.type || "-",
          status: subtask.status || "-",
          priority: subtask.priority || "-",
          scale: subtask.scale || "-",
          startDate: subtask.start_date,
          dueDate: subtask.due_date,
          finishDate: subtask.finish_date,
          durationStartToEnd: calculateDuration(subtask.start_date, subtask.due_date),
          durationStartToFinish: calculateDuration(subtask.start_date, subtask.finish_date),
          durationDueToFinish: calculateDuration(subtask.due_date, subtask.finish_date),
          completionStatus: subtask.note,
        });
      }
    }

    const pagination = {
      totalTasks,
      currentPage: pageNum,
      limit: limit === "all" ? totalTasks : limitNum,
      totalPages: limit === "all" ? 1 : Math.ceil(totalTasks / limitNum),
    };

    return res.status(200).json({
      success: true,
      summary,
      pagination,
      total: reports.length,
      data: reports,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};