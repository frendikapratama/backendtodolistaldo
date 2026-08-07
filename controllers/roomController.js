import dayjs from "dayjs";
import fs from "fs";
import path from "path";
import Room from "../models/Room.js";
import { handleError } from "../utils/errorHandler.js";
import Meeting from "../models/Meeting.js";
import MeetingParticipant from "../models/MeetingParticipant.js";

export async function getRooms(req, res) {
  try {
    const rooms = await Room.find().populate("facilities.facilityId", "nama");

    res.status(200).json({
      success: true,
      message: "berhasil mengambil data",
      data: rooms,
    });
  } catch (error) {
    handleError(res, error);
  }
}

export async function createRoom(req, res) {
  try {
    const { nama, lokasi, kapasitas, facilities } = req.body;

    if (!nama || !lokasi || !kapasitas) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        message: "Nama, lokasi, and kapasitas are required",
      });
    }

    let parsedFacilities = [];
    if (facilities) {
      try {
        parsedFacilities =
          typeof facilities === "string" ? JSON.parse(facilities) : facilities;
      } catch {
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({
          success: false,
          message: "Invalid facilities format",
        });
      }
    }

    const room = new Room({
      nama,
      lokasi,
      kapasitas: parseInt(kapasitas),
      facilities: parsedFacilities,
    });

    if (req.file) {
      room.photo = req.file.filename;
    }

    await room.save();

    res.status(201).json({
      success: true,
      message: "Room created successfully",
      data: room,
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return handleError(res, error);
  }
}

export async function deleteRoom(req, res) {
  try {
    const { id } = req.params;
    const room = await Room.findByIdAndDelete(id);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Room deleted successfully",
      data: room,
    });
  } catch (error) {
    handleError(res, error);
  }
}

export async function updateRoom(req, res) {
  try {
    const { id } = req.params;
    const { nama, lokasi, kapasitas, facilities } = req.body;

    const room = await Room.findById(id);
    if (!room) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    if (nama !== undefined) room.nama = nama;
    if (lokasi !== undefined) room.lokasi = lokasi;
    if (kapasitas !== undefined) room.kapasitas = parseInt(kapasitas);

    if (facilities !== undefined) {
      try {
        room.facilities =
          typeof facilities === "string" ? JSON.parse(facilities) : facilities;
      } catch {
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({
          success: false,
          message: "Invalid facilities format",
        });
      }
    }

    if (req.file) {
      if (room.photo) {
        const oldPath = path.join(
          process.cwd(),
          "uploads",
          "rooms",
          room.photo,
        );
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
      room.photo = req.file.filename;
    }

    await room.save();

    res.status(200).json({
      success: true,
      message: "Room updated successfully",
      data: room,
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return handleError(res, error);
  }
}

export async function getRoomSchedule(req, res) {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const room = await Room.findById(id);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    const now = new Date();
    const filterQuery = {
      roomId: id,
      status: { $ne: "cancelled" },
      endTime: { $gt: now },
    };

    if (startDate) filterQuery.startTime = { $gte: new Date(startDate) };
    if (endDate)
      filterQuery.endTime = { ...filterQuery.endTime, $lte: new Date(endDate) };

    const meetings = await Meeting.find(filterQuery)
      .populate("organizerId", "nama username email photo")
      .sort({ startTime: 1 })
      .lean();

    const meetingIds = meetings.map((m) => m._id);

    const participants = await MeetingParticipant.find({
      meetingId: { $in: meetingIds },
    })
      .populate("userId", "nama username email photo")
      .lean();

    const participantMap = participants.reduce((acc, p) => {
      const key = p.meetingId.toString();
      if (!acc[key]) acc[key] = [];
      acc[key].push({
        ...p.userId,
        invitationStatus: p.invitationStatus,
      });
      return acc;
    }, {});

    const schedule = meetings.map((meeting) => ({
      ...meeting,
      participants: participantMap[meeting._id.toString()] || [],
    }));

    return res.status(200).json({
      success: true,
      message: "Room schedule fetched successfully",
      data: {
        room: {
          _id: room._id,
          nama: room.nama,
          lokasi: room.lokasi,
          kapasitas: room.kapasitas,
        },
        schedule,
        total: schedule.length,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getDetailRoom(req, res) {
  try {
    const { id } = req.params;
    const now = new Date();

    const room = await Room.findById(id)
      .populate("facilities.facilityId", "nama")
      .lean();

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    // Sederhanakan data fasilitas
    room.facilities = room.facilities.map((item) => ({
      nama: item.facilityId?.nama,
      total: item.total,
    }));

    const meeting = await Meeting.findOne({
      roomId: id,
      status: { $ne: "cancelled" },
      endTime: { $gt: dayjs(now).subtract(30, "minute").toDate() },
    })
      .populate("organizerId", "username")
      .sort({ endTime: -1 })
      .lean();

    let roomStatus = {
      status: "available",
      isAvailable: true,
      message: "Available Now",
      nextAvailableAt: now,
      remainingMinutes: 0,
      currentMeeting: null,
    };

    if (meeting) {
      // Ambil field yang dibutuhkan saja
      const currentMeeting = {
        title: meeting.title,
        description: meeting.description,
        roomId: meeting.roomId,
        organizerId: meeting.organizerId,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        status: meeting.status,
      };

      if (meeting.startTime <= now && meeting.endTime > now) {
        const nextAvailable = dayjs(meeting.endTime).add(30, "minute").toDate();

        roomStatus = {
          status: "In Progress",
          isAvailable: false,
          message: `In Progress until ${dayjs(meeting.endTime).format("HH:mm")}`,
          nextAvailableAt: nextAvailable,
          remainingMinutes: dayjs(nextAvailable).diff(now, "minute"),
          currentMeeting,
        };
      } else if (
        meeting.endTime <= now &&
        dayjs(meeting.endTime).add(30, "minute").toDate() > now
      ) {
        const nextAvailable = dayjs(meeting.endTime).add(30, "minute").toDate();

        roomStatus = {
          status: "buffer",
          isAvailable: false,
          message: `Cleaning until ${dayjs(nextAvailable).format("HH:mm")}`,
          nextAvailableAt: nextAvailable,
          remainingMinutes: dayjs(nextAvailable).diff(now, "minute"),
          currentMeeting,
        };
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        room,
        ...roomStatus,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}
