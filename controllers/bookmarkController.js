import mongoose from "mongoose";
import Bookmark from "../models/Bookmark.js";
import Task from "../models/Task.js";
import { handleError } from "../utils/errorHandler.js";
import Group from "../models/Group.js";
import Project from "../models/Project.js";
import Workspace from "../models/Workspace.js";
import Kuarter from "../models/Kuarter.js";
import { getProgresByProject } from "./progresController.js";

export const addBookmark = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user._id;
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid projectId"
      });
    }
    // const groups = await Group.find({ project: projectId });
    // const groupIds = groups.map((g) => g._id);
    // const tasks = await Task.find({ groups: { $in: groupIds } });
    // let totalTaskProject = 0;
    // let weightedProgressSum = 0;
    // if (groups.length > 0) {
    //   for (let group of groups) {
    //     const tasksInGroup = tasks.filter(
    //       (t) => String(t.groups) === String(group._id)
    //     );
    //     const totalTaskGroup = tasksInGroup.length;
    //     const doneTaskGroup = tasksInGroup.filter(
    //       (t) => t.status === "Done"
    //     ).length;
    //     const progressGroup =
    //       totalTaskGroup === 0 ? 0 : (doneTaskGroup / totalTaskGroup) * 100;

    //     totalTaskProject += totalTaskGroup;
    //     weightedProgressSum += progressGroup * totalTaskGroup;
    //   }
    // }

    // const finalProgress =
    //   totalTaskProject === 0 ? 0 : weightedProgressSum / totalTaskProject;

    // Create bookmark
    const newBookmark = await Bookmark.create({
      user: userId,
      project: projectId,
      // progress: Math.round(finalProgress),
      // totalTask: totalTaskProject
    });

    res.status(201).json({
      success: true,
      message: "Bookmark added",
      data: newBookmark,
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Bookmark already exists",
      });
    }
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getBookmarks = async (req, res) => {
  try {
    const userId = req.user._id;
    // const bookmarks = await Bookmark.find({ user: userId }).populate("project", "nama description createdBy progress totalTask").lean();
    const bookmarks = await Bookmark.aggregate([
      { $match: { user: userId } },
      {
        $lookup: {
          from: "projects",
          localField: "project",
          foreignField: "_id",
          as: "project"
        }
      },
      { $unwind: "$project" },
      {
        $lookup: {
          from: "groups",
          localField: "project._id",
          foreignField: "project",
          as: "groups"
        }
      },
      {
        $lookup: {
          from: "tasks",
          localField: "groups._id",
          foreignField: "groups",
          as: "tasks"
        }
      },
      {
        $lookup: {
          from: "subtasks",
          localField: "tasks._id",
          foreignField: "task",
          as: "subtasks"
        }
      },
      {
        $match: {
          $or: [
            { "tasks.pic": userId },
            { "subtasks.pic": userId }
          ]
        }
      },
      {
        $addFields: {
          totalTask: { $size: "$tasks" },
          doneTask: {
            $size: {
              $filter: {
                input: "$tasks",
                as: "t",
                cond: { $eq: ["$$t.status", "Done"] }
              }
            }
          }
        }
      },
      {
        $addFields: {
          progress: {
            $cond: [
              { $eq: ["$totalTask", 0] },
              0,
              { $round: [{ $multiply: [{ $divide: ["$doneTask", "$totalTask"] }, 100] }, 0] }
            ]
          }
        }
      },
      {
        $project: {
          _id: 1,
          userId: "$user",
          projectId: "$project._id",
          projectName: "$project.nama",
          progress: 1,
          totalTask: 1
        }
      }
    ]);
    res.status(200).json({
      success: true,
      data: bookmarks,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const removeBookmark = async (req, res) => {
  try {
    const { bookmarkId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(bookmarkId)) {
      return res.status(400).json({ message: "Invalid bookmarkId" });
    }

    const deleted = await Bookmark.findOneAndDelete({
      _id: bookmarkId,
      user: userId,
    });

    if (!deleted) {
      return res.status(404).json({
        message: "Bookmark not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Bookmark removed",
      data: deleted,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
