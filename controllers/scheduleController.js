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

    const total = await Meeting.countDocuments(filter);

    const meetings = await Meeting.find(filter)
      .populate("roomId", "nama")
      .populate("organizerId", "username")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      message: "Success get my schedule",
      data: meetings,
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
