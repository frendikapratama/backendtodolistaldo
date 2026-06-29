import fs from "fs";
import path from "path";
import Meeting from "../models/Meeting.js";
import MeetingParticipant from "../models/MeetingParticipant.js";
import User from "../models/User.js";
import Room from "../models/Room.js";
import { handleError } from "../utils/errorHandler.js";
import { validateAvailability } from "../helpers/meetingAvailabilityService.js";
import { syncParticipants } from "../helpers/participantSyncService.js";
import MeetingHistory from "../models/MeetingHistory.js";

const meetingUploadsDir = path.join(
  process.cwd(),
  "uploads",
  "meeting-results",
);

export const checkAvailability = async (req, res) => {
  try {
    const { roomId, participantIds, startTime, endTime } = req.body;

    // ROOM CONFLICT
    const roomConflict = await Meeting.findOne({
      roomId,
      status: { $ne: "cancelled" },
      startTime: { $lt: new Date(endTime) },
      endTime: { $gt: new Date(startTime) },
    });

    // PARTICIPANT CONFLICT (sebagai participant)
    const participantConflict = await MeetingParticipant.find({
      userId: { $in: participantIds },
    })
      .populate({
        path: "meetingId",
        match: {
          status: { $ne: "cancelled" },
          startTime: { $lt: new Date(endTime) },
          endTime: { $gt: new Date(startTime) },
        },
        select: "title startTime endTime",
      })
      .populate("userId", "nama email");

    const conflicts = participantConflict.filter((item) => item.meetingId);

    // PARTICIPANT CONFLICT (sebagai organizer)
    const organizerConflicts = await Meeting.find({
      organizerId: { $in: participantIds },
      status: { $ne: "cancelled" },
      startTime: { $lt: new Date(endTime) },
      endTime: { $gt: new Date(startTime) },
    })
      .populate("organizerId", "nama email")
      .select("title startTime endTime organizerId");

    const organizerConflictFormatted = organizerConflicts.map((meeting) => ({
      userId: meeting.organizerId,
      meetingId: {
        _id: meeting._id,
        title: meeting.title,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
      },
      asOrganizer: true,
    }));

    const allConflicts = [...conflicts];
    for (const oc of organizerConflictFormatted) {
      const alreadyIn = allConflicts.some(
        (c) =>
          c.userId?._id?.toString() === oc.userId?._id?.toString() ||
          c.userId?.toString() === oc.userId?._id?.toString(),
      );
      if (!alreadyIn) allConflicts.push(oc);
    }

    return res.json({
      roomAvailable: !roomConflict,
      roomConflict,
      participantConflicts: allConflicts,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const createMeeting = async (req, res) => {
  try {
    const {
      title,
      description,
      roomId,
      organizerId,
      participantIds,
      startTime,
      endTime,
    } = req.body;

    // VALIDASI ROOM
    const roomConflict = await Meeting.findOne({
      roomId,
      status: { $ne: "cancelled" },
      startTime: { $lt: new Date(endTime) },
      endTime: { $gt: new Date(startTime) },
    });

    if (roomConflict) {
      return res.status(409).json({
        message: "The selected room is already booked for the specified time.",
      });
    }

    const meeting = await Meeting.create({
      title,
      description,
      roomId,
      organizerId,
      startTime,
      endTime,
    });

    const participants = participantIds.map((userId) => ({
      meetingId: meeting._id,
      userId,
    }));
    await MeetingParticipant.insertMany(participants);

    const populatedMeeting = await Meeting.findById(meeting._id)
      .populate("roomId", "nama")
      .populate("organizerId", "username")
      .lean();

    const io = req.app.get("io");
    io.emit("meeting:created", {
      meeting: populatedMeeting,
      roomId,
    });

    return res.status(201).json({
      success: true,
      data: meeting,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getMeeting = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      Meeting.find()
        .populate("roomId", "nama")
        .populate("organizerId", "username")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean(),
      Meeting.countDocuments(),
    ]);

    res.status(200).json({
      success: true,
      message: "success get data meeting",
      data: data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getMeetingParticipants = async (req, res) => {
  try {
    const { id } = req.params;
    const participants = await MeetingParticipant.find({
      meetingId: id,
    }).populate("userId", "nama username email photo");
    res.status(200).json({ success: true, data: participants });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const updateMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, organizerId, participantIds } = req.body;

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found." });
    }

    const oldData = {
      title: meeting.title,
      description: meeting.description,
      organizerId: meeting.organizerId,
    };

    meeting.title = title;
    meeting.description = description;
    meeting.organizerId = organizerId;
    await meeting.save();

    if (participantIds !== undefined) {
      await syncParticipants(meeting._id, participantIds);
    }

    await MeetingHistory.create({
      meetingId: meeting._id,
      action: "updated",
      changedBy: organizerId,
      oldData,
      newData: { title, description, organizerId },
    });

    // EMIT REALTIME
    const io = req.app.get("io");
    io.emit("meeting:updated", {
      meetingId: id,
      changes: { title, description, organizerId },
    });

    return res.status(200).json({
      success: true,
      message: "Meeting updated successfully.",
      data: meeting,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const rescheduleMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    const { roomId, startTime, endTime, changedBy } = req.body;

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found." });
    }

    const participants = await MeetingParticipant.find({ meetingId: id });
    const participantIds = participants.map((item) => item.userId);

    const { roomConflict, participantConflicts } = await validateAvailability({
      roomId,
      participantIds,
      startTime,
      endTime,
      excludeMeetingId: id,
    });

    if (roomConflict) {
      return res.status(409).json({
        message:
          "The selected room is unavailable during the requested time period.",
      });
    }

    const oldData = {
      roomId: meeting.roomId,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
    };

    meeting.roomId = roomId;
    meeting.startTime = new Date(startTime);
    meeting.endTime = new Date(endTime);
    await meeting.save();

    await MeetingHistory.create({
      meetingId: meeting._id,
      action: "rescheduled",
      changedBy,
      oldData,
      newData: { roomId, startTime, endTime },
    });

    // EMIT REALTIME
    const io = req.app.get("io");
    io.emit("meeting:rescheduled", {
      meetingId: id,
      oldRoomId: oldData.roomId,
      newRoomId: roomId,
      startTime,
      endTime,
    });

    return res.status(200).json({
      success: true,
      participantConflicts,
      data: meeting,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const cancelMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    const { cancelledReason, cancelledBy } = req.body;

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found." });
    }

    meeting.status = "cancelled";
    meeting.cancelledReason = cancelledReason;
    meeting.cancelledBy = cancelledBy;
    await meeting.save();

    await MeetingHistory.create({
      meetingId: meeting._id,
      action: "cancelled",
      changedBy: cancelledBy,
      newData: { cancelledReason },
    });

    // EMIT REALTIME
    const io = req.app.get("io");
    io.emit("meeting:cancelled", {
      meetingId: id,
      roomId: meeting.roomId,
    });

    return res.status(200).json({
      success: true,
      message: "Meeting has been cancelled successfully.",
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getDashboardData = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const [rooms, todaysMeetings] = await Promise.all([
      Room.find().lean(),
      Meeting.find({
        status: { $ne: "cancelled" },
        startTime: { $lt: tomorrow },
        endTime: { $gt: today },
      })
        .populate("organizerId", "username email")
        .sort({ startTime: 1 })
        .lean(),
    ]);

    const dashboardData = rooms.map((room) => {
      const roomMeetings = todaysMeetings.filter(
        (m) => m.roomId.toString() === room._id.toString(),
      );
      return {
        ...room,
        todaysBookings: roomMeetings,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Dashboard data fetched successfully",
      data: dashboardData,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getMeetingDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const meeting = await Meeting.findById(id)
      .populate("roomId", "nama lokasi kapasitas photo")
      .populate("organizerId", "nama username email photo")
      .populate("meetingResults.uploadedBy", "nama username email")
      .lean();

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    const participants = await MeetingParticipant.find({ meetingId: id })
      .populate("userId", "nama username email photo")
      .lean();

    const history = await MeetingHistory.find({ meetingId: id })
      .sort({ createdAt: -1 })
      .populate("changedBy", "nama username")
      .lean();

    const meetingDetail = {
      ...meeting,
      participants: participants.map((p) => p.userId),
      history: history,
      results: meeting.meetingResults || [],
    };

    return res.status(200).json({
      success: true,
      message: "Meeting detail fetched successfully",
      data: meetingDetail,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const addMeetingResult = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, userId } = req.body;

    if (!userId) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    if (meeting.status === "cancelled") {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        message: "Cannot add result to cancelled meeting",
      });
    }

    let resultData = {
      uploadedBy: userId,
      uploadedAt: new Date(),
    };

    if (req.file && content) {
      resultData.content = content;
      resultData.fileName = req.file.filename;
      resultData.originalName = req.file.originalname;
    } else if (req.file) {
      resultData.content = req.file.originalname;
      resultData.fileName = req.file.filename;
      resultData.originalName = req.file.originalname;
    } else if (content) {
      resultData.content = content;
      resultData.fileName = null;
    } else {
      return res.status(400).json({
        success: false,
        message: "Either content (text) or file must be provided",
      });
    }

    meeting.meetingResults.push(resultData);
    await meeting.save();

    await meeting.populate("meetingResults.uploadedBy", "nama username email");

    await MeetingHistory.create({
      meetingId: meeting._id,
      action: "result_added",
      changedBy: userId,
      newData: {
        resultType: req.file ? "file" : "text",
        content: req.file ? req.file.originalname : content,
      },
    });

    const newResult = meeting.meetingResults[meeting.meetingResults.length - 1];

    const io = req.app.get("io");
    io.emit("meeting:result_added", {
      meetingId: id,
      result: newResult,
    });

    return res.status(201).json({
      success: true,
      message: "Meeting result added successfully",
      data: newResult,
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return handleError(res, error);
  }
};

// UPDATE MEETING RESULT (ONLY FOR CONTENT/TEXT)
export const updateMeetingResult = async (req, res) => {
  try {
    const { id, resultId } = req.params;
    const { content, userId } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        message: "Content is required",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    const resultIndex = meeting.meetingResults.findIndex(
      (r) => r._id.toString() === resultId,
    );

    if (resultIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Result not found",
      });
    }

    const oldContent = meeting.meetingResults[resultIndex].content;

    meeting.meetingResults[resultIndex].content = content;
    await meeting.save();

    await MeetingHistory.create({
      meetingId: meeting._id,
      action: "result_updated",
      changedBy: userId,
      oldData: { content: oldContent },
      newData: { content: content },
    });

    await meeting.populate("meetingResults.uploadedBy", "nama username email");

    const io = req.app.get("io");
    io.emit("meeting:result_updated", {
      meetingId: id,
      resultId: resultId,
      content: content,
    });

    return res.status(200).json({
      success: true,
      message: "Meeting result updated successfully",
      data: meeting.meetingResults[resultIndex],
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const deleteMeetingResult = async (req, res) => {
  try {
    const { id, resultId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    const resultIndex = meeting.meetingResults.findIndex(
      (r) => r._id.toString() === resultId,
    );

    if (resultIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Result not found",
      });
    }

    const deletedResult = meeting.meetingResults[resultIndex];

    if (deletedResult.fileName) {
      const filePath = path.join(meetingUploadsDir, deletedResult.fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    meeting.meetingResults.splice(resultIndex, 1);
    await meeting.save();

    await MeetingHistory.create({
      meetingId: meeting._id,
      action: "result_deleted",
      changedBy: userId,
      oldData: {
        resultType: deletedResult.fileName ? "file" : "text",
        content: deletedResult.content,
      },
    });

    const io = req.app.get("io");
    io.emit("meeting:result_deleted", {
      meetingId: id,
      resultId: resultId,
    });

    return res.status(200).json({
      success: true,
      message: "Meeting result deleted successfully",
    });
  } catch (error) {
    return handleError(res, error);
  }
};
