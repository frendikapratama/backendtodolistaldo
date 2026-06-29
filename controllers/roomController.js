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

// roomController.js - tambahkan function ini

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
