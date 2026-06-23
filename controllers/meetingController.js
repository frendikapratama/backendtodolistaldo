import Meeting from "../models/Meeting.js";
import MeetingParticipant from "../models/MeetingParticipant.js";
import User from "../models/User.js";
import Room from "../models/Room.js";
import { handleError } from "../utils/errorHandler.js";
import { validateAvailability } from "../helpers/meetingAvailabilityService.js";
import { syncParticipants } from "../helpers/participantSyncService.js";
import MeetingHistory from "../models/MeetingHistory.js";

export const checkAvailability = async (req, res) => {
  try {
    const { roomId, participantIds, startTime, endTime } = req.body;

    // ROOM CONFLICT

    const roomConflict = await Meeting.findOne({
      roomId,

      status: {
        $ne: "cancelled",
      },

      startTime: {
        $lt: new Date(endTime),
      },

      endTime: {
        $gt: new Date(startTime),
      },
    });

    // PARTICIPANT CONFLICT

    const participantConflict = await MeetingParticipant.find({
      userId: {
        $in: participantIds,
      },
    })
      .populate({
        path: "meetingId",

        match: {
          status: {
            $ne: "cancelled",
          },

          startTime: {
            $lt: new Date(endTime),
          },

          endTime: {
            $gt: new Date(startTime),
          },
        },

        select: "title startTime endTime",
      })
      .populate("userId", "nama email");

    const conflicts = participantConflict.filter((item) => item.meetingId);

    return res.json({
      roomAvailable: !roomConflict,

      roomConflict,

      participantConflicts: conflicts,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
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

      status: {
        $ne: "cancelled",
      },

      startTime: {
        $lt: new Date(endTime),
      },

      endTime: {
        $gt: new Date(startTime),
      },
    });

    if (roomConflict) {
      return res.status(409).json({
        message: "Room sudah digunakan",
      });
    }

    // CREATE MEETING

    const meeting = await Meeting.create({
      title,
      description,
      roomId,
      organizerId,
      startTime,
      endTime,
    });

    // INSERT PARTICIPANT

    const participants = participantIds.map((userId) => ({
      meetingId: meeting._id,

      userId,
    }));

    await MeetingParticipant.insertMany(participants);

    return res.status(201).json({
      success: true,
      data: meeting,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
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

export const updateMeeting = async (req, res) => {
  try {
    const { id } = req.params;

    const { title, description, organizerId, participantIds } = req.body;

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({
        message: "Meeting tidak ditemukan",
      });
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

      newData: {
        title,
        description,
        organizerId,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Meeting berhasil diupdate",
      data: meeting,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const rescheduleMeeting = async (req, res) => {
  try {
    const { id } = req.params;

    const { roomId, startTime, endTime, changedBy } = req.body;

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({
        message: "Meeting tidak ditemukan",
      });
    }

    const participants = await MeetingParticipant.find({
      meetingId: id,
    });

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
        message: "Room sudah digunakan",
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

      newData: {
        roomId,
        startTime,
        endTime,
      },
    });

    return res.status(200).json({
      success: true,

      participantConflicts,

      data: meeting,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const cancelMeeting = async (req, res) => {
  try {
    const { id } = req.params;

    const { cancelledReason, cancelledBy } = req.body;

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({
        message: "Meeting tidak ditemukan",
      });
    }

    meeting.status = "cancelled";

    meeting.cancelledReason = cancelledReason;

    meeting.cancelledBy = cancelledBy;

    await meeting.save();

    await MeetingHistory.create({
      meetingId: meeting._id,

      action: "cancelled",

      changedBy: cancelledBy,

      newData: {
        cancelledReason,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Meeting berhasil dibatalkan",
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};
