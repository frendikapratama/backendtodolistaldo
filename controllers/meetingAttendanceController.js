import fs from "fs/promises";
import Meeting from "../models/Meeting.js";
import MeetingAttendance from "../models/MeetingAttendance.js";
import MeetingParticipant from "../models/MeetingParticipant.js";

const removeUploadedPhoto = (file) => {
  if (file) return fs.unlink(file.path).catch(() => {});
};

let attendanceIndexMigration;
async function ensureAttendanceIndexes() {
  if (!attendanceIndexMigration) {
    attendanceIndexMigration = MeetingAttendance.createCollection()
      .catch((error) => {
        if (error.codeName !== "NamespaceExists") throw error;
      })
      .then(() => MeetingAttendance.collection.indexes())
      .then((indexes) =>
        Promise.all(
          indexes
            .filter(
              (index) =>
                index.unique &&
                !index.partialFilterExpression &&
                index.key?.meetingId === 1 &&
                index.key?.userId === 1,
            )
            .map((index) => MeetingAttendance.collection.dropIndex(index.name)),
        ),
      )
      .catch((error) => {
        attendanceIndexMigration = null;
        throw error;
      });
  }
  await attendanceIndexMigration;
}

export async function getAttendanceOptions(req, res) {
  try {
    await ensureAttendanceIndexes();
    const { meetingId } = req.params;
    const meeting = await Meeting.findById(meetingId).select("title status");
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found." });
    }
    if (meeting.status !== "in_progress") {
      return res
        .status(400)
        .json({ message: "Attendance for this meeting is already closed." });
    }

    const participants = await MeetingParticipant.find({ meetingId })
      .populate("userId", "nama username")
      .lean();
    const data = participants.map((participant) => ({
      participantId: participant._id,
      userId: participant.userId?._id || null,
      name: participant.isExternal
        ? participant.externalName
        : participant.userId?.nama ||
          participant.userId?.username ||
          "Participant",
    }));
    const attendance = await MeetingAttendance.find({ meetingId })
      .select("participantId userId")
      .lean();
    const attendedParticipantIds = attendance
      .map((record) => record.participantId?.toString())
      .filter(Boolean);
    const attendedUserIds = attendance
      .map((record) => record.userId?.toString())
      .filter(Boolean);
    return res.json({
      success: true,
      meeting: { _id: meeting._id, title: meeting.title },
      data: data.map((person) => ({
        ...person,
        attended:
          (person.participantId &&
            attendedParticipantIds.includes(person.participantId.toString())) ||
          (person.userId &&
            attendedUserIds.includes(person.userId.toString())) ||
          false,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function checkIn(req, res) {
  try {
    await ensureAttendanceIndexes();
    const { meetingId } = req.params;
    const name = String(req.body.name || "").trim();
    if (!name || !req.file) {
      return res.status(400).json({ message: "Name and photo are required." });
    }

    const meeting =
      await Meeting.findById(meetingId).select("status organizerId");
    if (!meeting) {
      await removeUploadedPhoto(req.file);
      return res.status(404).json({ message: "Meeting not found." });
    }
    if (meeting.status !== "in_progress") {
      await removeUploadedPhoto(req.file);
      return res.status(400).json({
        message: "Attendance is only available during the meeting.",
      });
    }

    const { participantId } = req.body;
    let participant = null;
    if (participantId) {
      participant = await MeetingParticipant.findOne({
        _id: participantId,
        meetingId,
      });
      if (!participant) {
        await removeUploadedPhoto(req.file);
        return res
          .status(400)
          .json({ message: "Invalid participant selection." });
      }
    }

    const userId = participant?.userId || null;
    const existingConditions = [
      ...(participant ? [{ participantId: participant._id }] : []),
      ...(userId ? [{ userId }] : []),
    ];
    const existing = existingConditions.length
      ? await MeetingAttendance.findOne({ meetingId, $or: existingConditions })
      : null;
    if (existing) {
      await removeUploadedPhoto(req.file);
      return res.status(409).json({
        message: "Attendance for this meeting is already recorded .",
      });
    }

    const attendance = await MeetingAttendance.create({
      meetingId,
      participantId: participant?._id || null,
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
        message: "Attendance recap can only be viewed by the organizer.",
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
