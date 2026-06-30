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
import { sendMeetingInvitation } from "../helpers/meetingEmailService.js";
import { sendMeetingWhatsAppNotification } from "../helpers/meetingWhatsAppService.js";

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
      .populate("roomId", "nama lokasi")
      .populate("organizerId", "nama username email")
      .lean();

    const invitedUsers = await User.find(
      { _id: { $in: participantIds } },
      "nama username email noHp",
    ).lean();

    const organizer = populatedMeeting.organizerId; // { nama, username, email }
    const room = populatedMeeting.roomId; // { nama, lokasi }

    // ─── Email invitation (background, tidak menunggu)
    sendMeetingInvitation({
      participants: invitedUsers.map((u) => ({
        email: u.email,
        nama: u.nama || u.username,
      })),
      organizer,
      meeting: populatedMeeting,
      room,
    }).catch((err) => console.error("Email invitation error:", err));

    // ─── WhatsApp notification (background, tidak menunggu)
    sendMeetingWhatsAppNotification({
      participants: invitedUsers.map((u) => ({
        noHp: u.noHp,
        nama: u.nama || u.username,
        email: u.email, // <-- tambahkan ini
      })),
      organizer,
      meeting: populatedMeeting,
      room,
    }).catch((err) => console.error("WhatsApp invitation error:", err));

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

export const handleRSVP = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { status, email } = req.query;

    const validStatus = ["accepted", "decline", "tentative"];
    if (!validStatus.includes(status)) {
      return res.status(400).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px;">
          <h2 style="color:#EF4444;">Invalid response.</h2>
        </body></html>
      `);
    }

    const user = await User.findOne({
      email: { $regex: new RegExp(`^${email}$`, "i") },
    });

    if (!user) {
      return res.status(404).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px;">
          <h2 style="color:#EF4444;">User not found.</h2>
        </body></html>
      `);
    }

    const updated = await MeetingParticipant.findOneAndUpdate(
      { meetingId, userId: user._id },
      { invitationStatus: status, responseAt: new Date() },
      { new: true },
    );

    if (!updated) {
      return res.status(404).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px;">
          <h2 style="color:#EF4444;">Meeting or participant not found.</h2>
        </body></html>
      `);
    }

    const io = req.app.get("io");
    io.emit("meeting:rsvp_updated", {
      meetingId,
      userId: user._id,
      status,
      responseAt: updated.responseAt,
    });

    const labelMap = {
      accepted: {
        text: "You have accepted the meeting invitation.",
        color: "#4F46E5",
        icon: "✓",
      },
      decline: {
        text: "You have declined the meeting invitation.",
        color: "#EF4444",
        icon: "✗",
      },
      tentative: {
        text: "You marked attendance as maybe.",
        color: "#F59E0B",
        icon: "?",
      },
    };
    const { text, color, icon } = labelMap[status];

    // Redirect ke halaman konfirmasi sederhana
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
        <title>RSVP Confirmed</title>
      </head>
      <body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
          <div style="background:#FFFFFF;border-radius:16px;padding:48px 40px;max-width:440px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
            <div style="width:64px;height:64px;background:${color};border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:28px;color:#fff;line-height:64px;">${icon}</div>
            <p style="margin:0 0 8px 0;color:#4F46E5;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">Planify</p>
            <h1 style="margin:0 0 12px 0;font-size:22px;font-weight:700;color:#0F172A;">Response Recorded</h1>
            <p style="margin:0 0 32px 0;font-size:15px;color:#475569;line-height:1.6;">${text}</p>
            <p style="margin:0;font-size:13px;color:#94A3B8;">You may close this tab.</p>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    return res.status(500).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px;">
        <h2 style="color:#EF4444;">Server error: ${error.message}</h2>
      </body></html>
    `);
  }
};
