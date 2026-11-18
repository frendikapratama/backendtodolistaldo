import fs from "fs/promises";
import Meeting from "../models/Meeting.js";
import MeetingAttendance from "../models/MeetingAttendance.js";
import MeetingParticipant from "../models/MeetingParticipant.js";

const removeUploadedPhoto = (file) => {
  if (file) return fs.unlink(file.path).catch(() => {});
};

export async function checkIn(req, res) {
  try {
    const { meetingId } = req.params;
    const name = String(req.body.name || "").trim();
    if (!name || !req.file) {
      return res.status(400).json({ message: "Nama dan foto wajib diisi." });
    }

    const meeting = await Meeting.findById(meetingId).select(
      "status organizerId",
    );
    if (!meeting) {
      await removeUploadedPhoto(req.file);
      return res.status(404).json({ message: "Meeting tidak ditemukan." });
    }
    if (meeting.status !== "in_progress") {
      await removeUploadedPhoto(req.file);
      return res.status(400).json({
        message: "Absensi hanya tersedia saat meeting berlangsung.",
      });
    }

    const userId = req.user._id;
    const isOrganizer = meeting.organizerId.toString() === userId.toString();
    const isParticipant = await MeetingParticipant.exists({
      meetingId,
      userId,
      isExternal: false,
    });
    if (!isOrganizer && !isParticipant) {
      await removeUploadedPhoto(req.file);
      return res.status(403).json({
        message: "Anda bukan peserta meeting ini.",
      });
    }

    const existing = await MeetingAttendance.findOne({ meetingId, userId });
    if (existing) {
      await removeUploadedPhoto(req.file);
      return res.status(409).json({
        message: "Absensi untuk meeting ini sudah tercatat.",
      });
    }

    const attendance = await MeetingAttendance.create({
      meetingId,
      userId,
      name,
      photo: `/uploads/meeting-attendance/${req.file.filename}`,
    });
    return res.status(201).json({ success: true, data: attendance });
  } catch (error) {
    await removeUploadedPhoto(req.file);
    if (error.code === 11000) {
      return res.status(409).json({
        message: "Absensi untuk meeting ini sudah tercatat.",
      });
    }
    return res.status(500).json({ message: error.message });
  }
}

export async function getAttendanceRecap(req, res) {
  try {
    const { meetingId } = req.params;
    const meeting = await Meeting.findById(meetingId)
      .select("title status organizerId")
      .lean();
    if (!meeting) {
      return res.status(404).json({ message: "Meeting tidak ditemukan." });
    }
    if (meeting.organizerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: "Rekap absensi hanya dapat dilihat organizer.",
      });
    }

    const data = await MeetingAttendance.find({ meetingId })
      .populate("userId", "username email")
      .sort({ checkedInAt: 1 })
      .lean();
    return res.json({ success: true, meeting, data });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
