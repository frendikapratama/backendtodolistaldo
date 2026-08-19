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
import {
  sendMeetingInvitation,
  sendMeetingCancellationEmail,
  sendMeetingRescheduleEmail,
} from "../helpers/meetingEmailService.js";
import {
  sendMeetingWhatsAppNotification,
  sendMeetingCancellationWhatsApp,
  sendMeetingRescheduleWhatsApp,
} from "../helpers/meetingWhatsAppService.js";
import { sendPushNotification } from "../utils/expoPushUtils.js";
import { notifyUser } from "../helpers/notificationBookingMeetingHelper.js";
const meetingUploadsDir = path.join(
  process.cwd(),
  "uploads",
  "meeting-results",
);

export const checkAvailability = async (req, res) => {
  try {
    const {
      roomId,
      participantIds,
      externalParticipants, // BARU
      startTime,
      endTime,
      excludeMeetingId,
    } = req.body;

    const externalParticipantEmails = (externalParticipants || [])
      .filter((p) => p.email)
      .map((p) => p.email); // BARU

    const { roomConflict, conflictType, participantConflicts } =
      await validateAvailability({
        roomId,
        participantIds,
        externalParticipantEmails, // BARU
        startTime,
        endTime,
        excludeMeetingId,
      });

    let roomMessage = null;
    if (roomConflict) {
      roomMessage =
        conflictType === "buffer"
          ? "This room cannot be booked yet — a 30-minute cleaning buffer is required after the previous meeting ends. Please choose a different time or room."
          : "This room is already booked at that time. Please choose a different time or room.";
    }

    return res.json({
      roomAvailable: !roomConflict,
      roomConflict,
      conflictType, // "overlap" | "buffer" | null
      roomMessage,
      participantConflicts,
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
      meetingType,
      snackRequest,
      meetingLink,
      external_factory,
      roomId,
      organizerId,
      participantIds,
      externalParticipants,
      startTime,
      endTime,
    } = req.body;

    const finalSnackRequest =
      meetingType === "internal_department"
        ? []
        : Array.isArray(snackRequest)
          ? snackRequest
          : [];

    const externalParticipantEmails = (externalParticipants || [])
      .filter((p) => p.email)
      .map((p) => p.email); // BARU

    const { roomConflict, conflictType } = await validateAvailability({
      roomId,
      participantIds,
      externalParticipantEmails, // BARU
      startTime,
      endTime,
    });

    if (roomConflict) {
      const message =
        conflictType === "buffer"
          ? "The room cannot be booked yet — a 30-minute cleaning buffer is required after the previous meeting ends."
          : "The selected room is already booked for the specified time.";

      return res.status(409).json({ message, conflictType });
    }

    const meeting = await Meeting.create({
      title,
      description,
      meetingType,
      snackRequest: finalSnackRequest,
      meetingLink,
      external_factory,
      roomId,
      organizerId,
      participantIds,
      startTime,
      endTime,
    });

    const participants = participantIds.map((userId) => ({
      meetingId: meeting._id,
      userId,
    }));

    const externalDocs = (externalParticipants || [])
      .filter((p) => p.email)
      .map((p) => ({
        meetingId: meeting._id,
        isExternal: true,
        externalName: p.name || p.email,
        externalEmail: p.email,
        externalNoHp: p.noHp || null,
      }));

    await MeetingParticipant.insertMany([...participants, ...externalDocs]);

    const populatedMeeting = await Meeting.findById(meeting._id)
      .populate("roomId", "nama lokasi")
      .populate("organizerId", "username email")
      .lean();

    const invitedUsers = await User.find(
      { _id: { $in: participantIds } },
      "nama username email noHp",
    ).lean();

    const externalInvited = (externalParticipants || [])
      .filter((p) => p.email)
      .map((p) => ({
        nama: p.name || p.email,
        username: p.name || p.email,
        email: p.email,
        noHp: p.noHp || null,
      }));

    // ─── Tambahkan HRD, GA, IT sebagai penerima notifikasi
    const targetDivisions = [/^it$/i];
    const targetUserIds = [
      "6a20de5c50ad9c30e06b9641", // hadi
      "6a1f97c04cf5cd6b3c82a2f4", // mia
    ];
    const ItUsers = await User.find({
      $or: [
        { divisi: { $in: targetDivisions } },
        { _id: { $in: targetUserIds } },
      ],
      _id: { $nin: participantIds },
    })
      .select("nama username email noHp")
      .lean();

    const allNotifyUsers = [
      ...invitedUsers.map((u) => ({ ...u, isParticipant: true })),
      ...externalInvited.map((u) => ({ ...u, isParticipant: true })),
      ...ItUsers.map((u) => ({ ...u, isParticipant: false })),
    ];

    const organizer = populatedMeeting.organizerId;
    const room = populatedMeeting.roomId;

    const io = req.app.get("io");

    io.emit("meeting:created", { meeting: populatedMeeting, roomId });

    res.status(201).json({ success: true, data: meeting });

    // ─── Jalankan notifikasi setelah response terkirim, paralel, tidak diawait
    setImmediate(() => {
      Promise.allSettled([
        sendMeetingInvitation({
          participants: allNotifyUsers.map((u) => ({
            email: u.email,
            nama: u.nama || u.username,
            isParticipant: u.isParticipant,
          })),
          organizer,
          meeting: populatedMeeting,
          room,
        }),

        sendMeetingWhatsAppNotification({
          participants: allNotifyUsers.map((u) => ({
            noHp: u.noHp,
            nama: u.nama || u.username,
            email: u.email,
            isParticipant: u.isParticipant,
          })),
          organizer,
          meeting: populatedMeeting,
          room,
        }),
      ]).then(([emailResult, waResult]) => {
        if (emailResult.status === "rejected")
          console.error("Email invitation error:", emailResult.reason);
        if (waResult.status === "rejected")
          console.error("WhatsApp invitation error:", waResult.reason);
      });

      // Push Notification
      Promise.all(
        allNotifyUsers.map((u) => {
          if (u._id) {
            return notifyUser(
              u._id,
              `[Meeting Invitation] ${populatedMeeting.title}`,
              u.isParticipant 
                ? `${organizer.nama || organizer.username} has invited you to a meeting.`
                : `Notice: ${organizer.nama || organizer.username} has scheduled a meeting that requires your department's attention.`,
              { type: "meeting_invitation", meetingId: populatedMeeting._id },
              io,
            );
          }
        }),
      ).catch((err) =>
        console.error("Push notification error in createMeeting:", err),
      );
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getMeeting = async (req, res) => {
  try {
    const {
      organizerId,
      roomId,
      startDate,
      endDate,
      status,
      meetingType,
      search,
      page,
      limit,
    } = req.query;

    // PAGINATION
    const pageNum = parseInt(page) || 1;
    const limitNum = limit === "all" ? 0 : parseInt(limit) || 25;
    const skipNum = (pageNum - 1) * limitNum;

    // BUILD FILTER
    const filter = {};

    // Organizer Filter
    if (organizerId) {
      filter.organizerId = organizerId;
    }

    // Room Filter
    if (roomId) {
      filter.roomId = roomId;
    }

    // Status Filter
    if (status && status !== "all") {
      filter.status = status;
    }

    // Meeting Type Filter
    if (meetingType && meetingType !== "all") {
      filter.meetingType = meetingType;
    }

    // Date Range Filter
    if (startDate || endDate) {
      filter.startTime = {};

      if (startDate) {
        filter.startTime.$gte = new Date(startDate);
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.startTime.$lte = end;
      }
    }

    // Search Filter
    if (search && search.trim() !== "") {
      filter.title = {
        $regex: search.trim(),
        $options: "i",
      };
    }

    const total = await Meeting.countDocuments(filter);

    let meetingQuery = Meeting.find(filter)
      .populate("roomId", "nama")
      .populate("organizerId", "username")
      .sort({
        createdAt: -1,
      });

    if (limit !== "all") {
      meetingQuery = meetingQuery.skip(skipNum).limit(limitNum);
    }

    const data = await meetingQuery.lean();

    return res.status(200).json({
      success: true,
      message: "success get data meeting",
      data,
      pagination: {
        page: pageNum,
        limit: limit === "all" ? total : limitNum,
        total,
        totalPages: limit === "all" ? 1 : Math.ceil(total / limitNum),
        hasNext:
          limit === "all" ? false : pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1,
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

    const {
      title,
      description,
      organizerId,
      participantIds,
      externalParticipants,
      meetingType,
      snackRequest,
      meetingLink,
      external_factory,
    } = req.body;

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found.",
      });
    }

    // Validasi conflict PARTICIPANT saja — room & waktu tidak diubah di endpoint ini
    if (participantIds !== undefined) {
      const { participantConflicts } = await validateAvailability({
        roomId: meeting.roomId,
        participantIds,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        excludeMeetingId: meeting._id, // exclude meeting ini sendiri dari pengecekan
      });

      // Kirim balik ke frontend supaya konsisten dengan flow checkAvailability,
      // tapi tidak memblokir update — hanya informasi
      req.meetingParticipantConflicts = participantConflicts;
    }

    const oldData = {
      title: meeting.title,
      description: meeting.description,
      organizerId: meeting.organizerId,
      meetingType: meeting.meetingType,
      snackRequest: meeting.snackRequest,
      meetingLink: meeting.meetingLink,
      external_factory: meeting.external_factory,
    };
    const finalSnackRequest =
      meetingType === "internal_department"
        ? []
        : Array.isArray(snackRequest)
          ? snackRequest
          : [];

    meeting.title = title;
    meeting.description = description;
    meeting.organizerId = organizerId;
    meeting.meetingType = meetingType;
    meeting.snackRequest = finalSnackRequest;
    meeting.meetingLink = meetingLink;
    meeting.external_factory = external_factory;

    await meeting.save();

    if (participantIds !== undefined || externalParticipants !== undefined) {
      await syncParticipants(meeting._id, participantIds, externalParticipants);
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
        meetingType,
        snackRequest,
        meetingLink,
        external_factory,
      },
    });

    req.app.get("io").emit("meeting:updated", {
      meetingId: id,
      changes: {
        title,
        description,
        organizerId,
        meetingType,
        snackRequest,
        meetingLink,
        external_factory,
      },
    });

    // Push Notification
    setImmediate(async () => {
      try {
        const participantsData = await MeetingParticipant.find({
          meetingId: id,
        });
        const notifyUserIds = participantsData
          .filter((p) => !p.isExternal && p.userId)
          .map((p) => p.userId);

        await Promise.all(
          notifyUserIds.map((userId) => {
            return notifyUser(
              userId,
              `[Meeting Updated] ${title}`,
              `Details for meeting "${title}" have been updated.`,
              { type: "meeting_updated", meetingId: id },
              req.app.get("io"),
            );
          }),
        );
      } catch (err) {
        console.error("Push notification error in updateMeeting:", err);
      }
    });

    return res.status(200).json({
      success: true,
      message: "Meeting updated successfully.",
      data: meeting,
      participantConflicts: req.meetingParticipantConflicts || [],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
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
      return res.status(404).json({ message: "Meeting not found." });
    }
    const io = req.app.get("io");

    // Ambil seluruh participant (internal + eksternal) untuk pengecekan bentrok
    const participants = await MeetingParticipant.find({ meetingId: id });
    const participantIds = participants
      .filter((p) => !p.isExternal)
      .map((item) => item.userId);

    const externalParticipantEmails = participants
      .filter((p) => p.isExternal && p.externalEmail)
      .map((p) => p.externalEmail);

    const { roomConflict, conflictType, participantConflicts } =
      await validateAvailability({
        roomId,
        participantIds,
        externalParticipantEmails,
        startTime,
        endTime,
        excludeMeetingId: id,
      });

    if (roomConflict) {
      const message =
        conflictType === "buffer"
          ? "The room cannot be booked yet — a 30-minute cleaning buffer is required after the previous meeting ends."
          : "The selected room is unavailable during the requested time period.";

      return res.status(409).json({ message });
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

    const populatedMeeting = await Meeting.findById(meeting._id)
      .populate("roomId", "nama lokasi")
      .populate("organizerId", "nama username email")
      .lean();

    const rescheduler = await User.findById(changedBy).select(
      "nama username email",
    );

    const participantsData = await MeetingParticipant.find({ meetingId: id })
      .populate("userId", "nama username email noHp")
      .lean();

    const participantUsers = participantsData
      .filter((p) => !p.isExternal)
      .map((p) => p.userId)
      .filter((u) => u);

    const externalParticipantUsers = participantsData
      .filter((p) => p.isExternal)
      .map((p) => ({
        _id: p._id,
        nama: p.externalName,
        username: p.externalName,
        email: p.externalEmail,
        noHp: p.externalNoHp,
      }));

    const targetDivisions = [/^it$/i];
    const targetUserIds = [
      "6a20de5c50ad9c30e06b9641", // hadi
      "6a1f97c04cf5cd6b3c82a2f4", // mia
    ];
    const ItUsers = await User.find({
      $or: [
        { divisi: { $in: targetDivisions } },
        { _id: { $in: targetUserIds } },
      ],
      _id: { $nin: participantUsers.map((u) => u._id) },
    })
      .select("nama username email noHp")
      .lean();

    const allNotifyUsers = [
      ...participantUsers.map((u) => ({ ...u, isParticipant: true })),
      ...externalParticipantUsers.map((u) => ({ ...u, isParticipant: true })),
      ...ItUsers.map((u) => ({ ...u, isParticipant: false })),
    ];

    if (allNotifyUsers.length > 0) {
      sendMeetingRescheduleEmail({
        users: allNotifyUsers,
        meeting: populatedMeeting,
        room: populatedMeeting.roomId,
        rescheduler,
        oldData,
      }).catch((err) => console.error("Email reschedule error:", err));

      sendMeetingRescheduleWhatsApp({
        users: allNotifyUsers,
        meeting: populatedMeeting,
        room: populatedMeeting.roomId,
        rescheduler,
        oldData,
      }).catch((err) => console.error("WhatsApp reschedule error:", err));

      // Push Notification
      Promise.all(
        allNotifyUsers.map((u) => {
          if (u._id) {
            return notifyUser(
              u._id,
              `[Meeting Rescheduled] ${populatedMeeting.title}`,
              u.isParticipant 
                ? `The meeting ${populatedMeeting.title} has been rescheduled by ${rescheduler?.nama || rescheduler?.username || "Admin"}.`
                : `Notice: The meeting ${populatedMeeting.title} related to your department has been rescheduled by ${rescheduler?.nama || rescheduler?.username || "Admin"}.`,
              { type: "meeting_rescheduled", meetingId: id },
              io,
            );
          }
        }),
      ).catch((err) =>
        console.error("Push notification error in rescheduleMeeting:", err),
      );
    }

    // EMIT REALTIME
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

    const meeting = await Meeting.findById(id).populate("roomId", "nama");
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found." });
    }
    // EMIT REALTIME
    const io = req.app.get("io");

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

    const canceller = await User.findById(cancelledBy).select(
      "nama username email",
    );

    // Ambil seluruh participant meeting
    const participantsData = await MeetingParticipant.find({
      meetingId: id,
    })
      .populate("userId", "nama username email noHp")
      .lean();

    const participantUsers = participantsData
      .filter((p) => !p.isExternal)
      .map((p) => p.userId)
      .filter(Boolean);

    const externalParticipantUsers = participantsData
      .filter((p) => p.isExternal)
      .map((p) => ({
        _id: p._id,
        nama: p.externalName,
        username: p.externalName,
        email: p.externalEmail,
        noHp: p.externalNoHp,
      }));

    // Ambil IT selain participant
    const targetDivisions = [/^it$/i];
    const targetUserIds = [
      "6a20de5c50ad9c30e06b9641", // hadi
      "6a1f97c04cf5cd6b3c82a2f4", // mia
    ];

    const ItUsers = await User.find({
      $or: [
        { divisi: { $in: targetDivisions } },
        { _id: { $in: targetUserIds } },
      ],
      _id: { $nin: participantUsers.map((u) => u._id) },
    })
      .select("nama username email noHp")
      .lean();

    // Gabungkan dan hilangkan duplikasi
    const notifyUsers = [
      ...participantUsers.map((u) => ({ ...u, isParticipant: true })),
      ...externalParticipantUsers.map((u) => ({ ...u, isParticipant: true })),
      ...ItUsers.map((u) => ({ ...u, isParticipant: false })),
    ];

    if (notifyUsers.length > 0) {
      sendMeetingCancellationEmail({
        users: notifyUsers,
        meeting,
        canceller,
        cancelledReason,
      }).catch((err) => console.error("Email cancellation error:", err));

      sendMeetingCancellationWhatsApp({
        users: notifyUsers,
        meeting,
        canceller,
        cancelledReason,
      }).catch((err) => console.error("WhatsApp cancellation error:", err));

      // Push Notification
      Promise.all(
        notifyUsers.map((u) => {
          if (u._id) {
            return notifyUser(
              u._id,
              `[Meeting Cancelled] ${meeting.title}`,
              u.isParticipant
                ? `The meeting ${meeting.title} has been cancelled by ${canceller?.nama || canceller?.username || "Admin"}.`
                : `Notice: The meeting ${meeting.title} that requires your department's support has been cancelled by ${canceller?.nama || canceller?.username || "Admin"}.`,
              { type: "meeting_cancelled", meetingId: id },
              io,
            );
          }
        }),
      ).catch((err) =>
        console.error("Push notification error in cancelMeeting:", err),
      );
    }

    io.emit("meeting:cancelled", {
      meetingId: id,
      roomId: meeting.roomId ? meeting.roomId._id : undefined,
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
      .populate("organizerId", "username email photo")
      .populate("meetingResults.uploadedBy", "nama username email")
      .lean();

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    const participants = await MeetingParticipant.find({ meetingId: id })
      .populate("userId", "username email photo")
      .lean();

    const participantsWithStatus = participants.map((p) => {
      if (p.isExternal) {
        return {
          _id: p._id,
          username: p.externalName,
          email: p.externalEmail,
          noHp: p.externalNoHp,
          photo: null,
          isExternal: true,
          invitationStatus: p.invitationStatus,
          responseAt: p.responseAt,
        };
      }
      return {
        _id: p.userId._id,
        username: p.userId.username,
        email: p.userId.email,
        photo: p.userId.photo || null,
        isExternal: false,
        invitationStatus: p.invitationStatus,
        responseAt: p.responseAt,
      };
    });

    const meetingDetail = {
      ...meeting,
      participants: participantsWithStatus,
      summary: {
        total: participants.length,
        accepted: participants.filter((p) => p.invitationStatus === "accepted")
          .length,
        pending: participants.filter((p) => p.invitationStatus === "pending")
          .length,
        declined: participants.filter((p) => p.invitationStatus === "decline")
          .length,
        tentative: participants.filter(
          (p) => p.invitationStatus === "tentative",
        ).length,
      },
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
    const { token } = req.params;
    let meetingId, status, email;

    if (req.query.status && req.query.email) {
      // Fallback for old links
      meetingId = token;
      status = req.query.status;
      email = req.query.email;
    } else {
      try {
        const decodedStr = Buffer.from(token, "base64").toString("utf-8");
        if (decodedStr.startsWith("{")) {
          // Fallback for the intermediate JSON token format
          const decoded = JSON.parse(decodedStr);
          meetingId = decoded.m;
          status = decoded.s;
          email = decoded.e;
        } else {
          // New compact binary format
          const decodedBuf = Buffer.from(token, "base64");
          meetingId = decodedBuf.slice(0, 12).toString("hex");
          const sChar = decodedBuf.slice(12, 13).toString("utf8");
          const statusMapRev = { a: "accepted", t: "tentative", d: "decline" };
          status = statusMapRev[sChar];
          email = decodedBuf.slice(13).toString("utf8");
        }
      } catch (err) {
        return res.status(400).send(`
          <html><body style="font-family:sans-serif;text-align:center;padding:60px;">
            <h2 style="color:#EF4444;">Invalid or expired link.</h2>
          </body></html>
        `);
      }
    }

    const validStatus = ["accepted", "decline", "tentative"];
    if (!validStatus.includes(status)) {
      return res.status(400).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px;">
          <h2 style="color:#EF4444;">Invalid response.</h2>
        </body></html>
      `);
    }

    // ── Coba cari sebagai peserta EKSTERNAL dulu (berdasarkan email)
    let participant = await MeetingParticipant.findOne({
      meetingId,
      isExternal: true,
      externalEmail: { $regex: new RegExp(`^${email}$`, "i") },
    });

    // ── Kalau bukan eksternal, cari sebagai peserta internal (User)
    if (!participant) {
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

      participant = await MeetingParticipant.findOne({
        meetingId,
        userId: user._id,
      });
    }

    if (!participant) {
      return res.status(404).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px;">
          <h2 style="color:#EF4444;">Meeting or participant not found.</h2>
        </body></html>
      `);
    }

    if (participant.invitationStatus !== "pending") {
      const currentStatusText =
        {
          accepted: "accepted",
          decline: "declined",
          tentative: "tentative",
        }[participant.invitationStatus] || participant.invitationStatus;

      return res.status(200).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px;">
          <h2 style="color:#4F46E5;">Response already recorded.</h2>
          <p>Your response was already saved as ${currentStatusText}.</p>
        </body></html>
      `);
    }

    const updated = await MeetingParticipant.findOneAndUpdate(
      {
        _id: participant._id,
        invitationStatus: "pending",
      },
      {
        invitationStatus: status,
        responseAt: new Date(),
      },
      { new: true },
    );

    if (!updated) {
      return res.status(200).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px;">
          <h2 style="color:#4F46E5;">Response already recorded.</h2>
          <p>Your response has already been saved.</p>
        </body></html>
      `);
    }

    const io = req.app.get("io");
    io.emit("meeting:rsvp_updated", {
      meetingId,
      userId: participant.userId || null,
      participantEmail: participant.isExternal
        ? participant.externalEmail
        : email,
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

export const endMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    const { endTime, endedBy } = req.body;

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found." });
    }

    if (meeting.status !== "in_progress") {
      return res.status(400).json({ message: "Meeting is not in progress." });
    }

    meeting.endTime = new Date(endTime);
    meeting.status = "completed";
    await meeting.save();

    await MeetingHistory.create({
      meetingId: meeting._id,
      action: "ended",
      changedBy: endedBy,
      newData: { endTime, status: "completed" },
    });

    const io = req.app.get("io");
    io.emit("meeting:ended", {
      meetingId: id,
      endTime,
      status: "completed",
    });

    return res.status(200).json({
      success: true,
      message: "Meeting ended successfully.",
      data: meeting,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getMeetingTodayByUserLogin = async (req, res) => {
  try {
    const userId = req.user._id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const participantMeetings = await MeetingParticipant.find({
      userId: userId,
    }).select("meetingId");

    const meetings = await Meeting.find({
      $or: [
        { _id: { $in: participantMeetings.map((p) => p.meetingId) } },
        { organizerId: userId },
      ],
      startTime: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    })
      .populate("roomId", "nama lokasi")
      .populate("organizerId", "username")
      .select("-createdAt -updatedAt -__v")
      .sort({ startTime: 1 });

    return res.status(200).json({
      success: true,
      data: meetings,
      total: meetings.length,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getMeetingToday = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const meetings = await Meeting.find({
      startTime: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    })
      .populate("roomId", "nama lokasi")
      .populate("organizerId", "username")
      .select("-createdAt -updatedAt -__v")
      .sort({ startTime: 1 });

    return res.status(200).json({
      success: true,
      data: meetings,
      total: meetings.length,
    });
  } catch (error) {
    return handleError(res, error);
  }
};
