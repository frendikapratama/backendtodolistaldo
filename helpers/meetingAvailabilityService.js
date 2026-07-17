import Meeting from "../models/Meeting.js";
import MeetingParticipant from "../models/MeetingParticipant.js";

export async function validateAvailability({
  roomId,
  participantIds = [],
  externalParticipantEmails = [], // BARU
  startTime,
  endTime,
  excludeMeetingId = null,
}) {
  const reqStart = new Date(startTime);
  const reqEnd = new Date(endTime);

  const baseQuery = {
    roomId,
    status: { $ne: "cancelled" },
  };
  if (excludeMeetingId) {
    baseQuery._id = { $ne: excludeMeetingId };
  }

  // 1) Cek overlap ASLI dulu (tanpa buffer)
  const overlapConflict = await Meeting.findOne({
    ...baseQuery,
    startTime: { $lt: reqEnd },
    endTime: { $gt: reqStart },
  });

  // 2) Kalau tidak overlap asli, baru cek apakah kena buffer 30 menit
  let bufferConflict = null;
  if (!overlapConflict) {
    bufferConflict = await Meeting.findOne({
      ...baseQuery,
      startTime: { $lt: new Date(reqEnd.getTime() + 30 * 60000) },
      endTime: { $gt: new Date(reqStart.getTime() - 30 * 60000) },
    });
  }

  const roomConflict = overlapConflict || bufferConflict;
  const conflictType = overlapConflict
    ? "overlap"
    : bufferConflict
      ? "buffer"
      : null;

  // Gabungkan kondisi internal (userId) dan eksternal (externalEmail)
  const orConditions = [];
  if (participantIds.length > 0) {
    orConditions.push({ userId: { $in: participantIds } });
  }
  if (externalParticipantEmails.length > 0) {
    orConditions.push({
      isExternal: true,
      externalEmail: {
        $in: externalParticipantEmails.map(
          (email) => new RegExp(`^${email}$`, "i"),
        ),
      },
    });
  }

  const participantConflict =
    orConditions.length > 0
      ? await MeetingParticipant.find({
          $or: orConditions,
          invitationStatus: { $ne: "decline" }, // BARU: abaikan yang sudah decline
        })
          .populate({
            path: "meetingId",
            match: {
              ...(excludeMeetingId && { _id: { $ne: excludeMeetingId } }),
              status: { $ne: "cancelled" },
              startTime: { $lt: endTime },
              endTime: { $gt: startTime },
            },
            select: "title startTime endTime",
          })
          .populate("userId", "username email")
      : [];

  const participantConflicts = participantConflict.filter(
    (item) => item.meetingId,
  );

  return {
    roomConflict,
    conflictType, // "overlap" | "buffer" | null
    participantConflicts,
  };
}
