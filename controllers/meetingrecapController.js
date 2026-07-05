import mongoose from "mongoose";
import Meeting from "../models/Meeting.js";

const buildMatchStage = (query) => {
  const { startDate, endDate, roomId, organizerId, status } = query;
  const match = {};

  if (startDate || endDate) {
    match.startTime = {};
    if (startDate) {
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        throw { statusCode: 400, message: "startDate tidak valid" };
      }
      match.startTime.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      if (isNaN(end.getTime())) {
        throw { statusCode: 400, message: "endDate tidak valid" };
      }
      end.setHours(23, 59, 59, 999);
      match.startTime.$lte = end;
    }
  }

  if (roomId) {
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      throw { statusCode: 400, message: "roomId tidak valid" };
    }
    match.roomId = new mongoose.Types.ObjectId(roomId);
  }

  if (organizerId) {
    if (!mongoose.Types.ObjectId.isValid(organizerId)) {
      throw { statusCode: 400, message: "organizerId tidak valid" };
    }
    match.organizerId = new mongoose.Types.ObjectId(organizerId);
  }

  if (status) {
    const statusList = Array.isArray(status) ? status : status.split(",");
    match.status = { $in: statusList };
  }

  return match;
};

export const getRecapSummary = async (req, res) => {
  try {
    const match = buildMatchStage(req.query);

    const [summary] = await Meeting.aggregate([
      { $match: match },
      {
        $facet: {
          totalMeetings: [{ $count: "count" }],
          byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          totalWithResults: [
            { $match: { "meetingResults.0": { $exists: true } } },
            { $count: "count" },
          ],
        },
      },
    ]);

    const byStatus = summary.byStatus.reduce((acc, cur) => {
      acc[cur._id] = cur.count;
      return acc;
    }, {});

    return res.status(200).json({
      success: true,
      data: {
        totalMeetings: summary.totalMeetings[0]?.count || 0,
        totalWithResults: summary.totalWithResults[0]?.count || 0,
        byStatus,
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Gagal mengambil rekap summary",
    });
  }
};

export const getMeetingResultsList = async (req, res) => {
  try {
    const match = buildMatchStage(req.query);
    if (req.query.onlyWithResults === "true") {
      match["meetingResults.0"] = { $exists: true };
    }

    const isExportAll = req.query.limit === "all";
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = isExportAll
      ? 0
      : Math.max(parseInt(req.query.limit) || 10, 1);
    const skip = isExportAll ? 0 : (page - 1) * limit;

    let baseQuery = Meeting.find(match)
      .populate("roomId", "nama")
      .populate("organizerId", "email username")
      .populate("meetingResults.uploadedBy", " username email")
      .select(
        "title description roomId organizerId startTime endTime status meetingType meetingResults",
      )
      .sort({ startTime: -1 });

    if (!isExportAll) {
      baseQuery = baseQuery.skip(skip).limit(limit);
    }

    const [meetings, totalCount] = await Promise.all([
      baseQuery.lean(),
      Meeting.countDocuments(match),
    ]);

    return res.status(200).json({
      success: true,
      data: meetings,
      pagination: {
        page,
        limit: isExportAll ? totalCount : limit,
        totalCount,
        totalPages: isExportAll ? 1 : Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Gagal mengambil daftar hasil meeting",
    });
  }
};
