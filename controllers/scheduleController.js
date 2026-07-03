import Meeting from "../models/Meeting.js";
import MeetingParticipant from "../models/MeetingParticipant.js";
import { handleError } from "../utils/errorHandler.js";

export const getMySchedule = async (req, res) => {
  try {
    const userId = req.user._id;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 25;
    const skip = (page - 1) * limit;

    const participantMeetings = await MeetingParticipant.find({ userId })
      .select("meetingId")
      .lean();

    const meetingIds = [
      ...new Set(participantMeetings.map(({ meetingId }) => meetingId)),
    ];

    const filter = {
      $or: [{ organizerId: userId }, { _id: { $in: meetingIds } }],
    };

    const meetings = await Meeting.find(filter)
      .populate("roomId", "nama")
      .populate("organizerId", "username")
      .lean();

    const now = new Date();

    meetings.sort((a, b) => {
      const aTime = new Date(a.startTime);
      const bTime = new Date(b.startTime);

      const aUpcoming = aTime >= now;
      const bUpcoming = bTime >= now;

      // Upcoming di atas
      if (aUpcoming && !bUpcoming) return -1;
      if (!aUpcoming && bUpcoming) return 1;

      // Sama-sama upcoming -> ASC
      if (aUpcoming && bUpcoming) {
        return aTime - bTime;
      }

      // Sama-sama sudah lewat -> DESC
      return bTime - aTime;
    });

    const total = meetings.length;

    const paginatedMeetings = meetings.slice(skip, skip + limit);

    return res.status(200).json({
      success: true,
      message: "Success get my schedule",
      data: paginatedMeetings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    handleError(res, error);
  }
};
