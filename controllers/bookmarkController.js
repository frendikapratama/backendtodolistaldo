import mongoose from "mongoose";
import Bookmark from "../models/Bookmark.js";

export const addBookmark = async (req, res) => {
  try {
    const { projectId } = req.body;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: "Invalid projectId" });
    }

    const newBookmark = await Bookmark.create({
      user: userId,
      project: projectId,
    });

    res.status(201).json({
      success: true,
      message: "Bookmark added",
      data: newBookmark,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "Bookmark already exists",
      });
    }
    res.status(500).json({ message: error.message });
  }
};

export const getBookmarks = async (req, res) => {
  try {
    const userId = req.user._id;

    const bookmarks = await Bookmark.find({ user: userId })
      .populate("project", "nama description createdBy")
      .lean();

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
