import Meeting from "../models/Meeting.js";
import MeetingParticipant from "../models/MeetingParticipant.js";

export async function validateAvailability({
  roomId,
  participantIds = [],
  startTime,
  endTime,
  excludeMeetingId = null,
}) {
  const roomQuery = {
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
  };

  if (excludeMeetingId) {
    roomQuery._id = {
      $ne: excludeMeetingId,
    };
  }

  const roomConflict = await Meeting.findOne(roomQuery);

  const participantConflict = await MeetingParticipant.find({
    userId: {
      $in: participantIds,
    },
  })
    .populate({
      path: "meetingId",

      match: {
        ...(excludeMeetingId && {
          _id: {
            $ne: excludeMeetingId,
          },
        }),

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
    .populate("userId", "username email");

  const participantConflicts = participantConflict.filter(
    (item) => item.meetingId,
  );

  return {
    roomConflict,
    participantConflicts,
  };
}
