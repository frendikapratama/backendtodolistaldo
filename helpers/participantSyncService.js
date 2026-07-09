import MeetingParticipant from "../models/MeetingParticipant.js";
export async function syncParticipants(meetingId, participantIds) {
  if (!participantIds) return;

  const existing = await MeetingParticipant.find({
    meetingId,
  });
  const existingIds = existing.map((item) => item.userId.toString());

  const incomingIds = participantIds.map((id) => id.toString());

  const toAdd = incomingIds.filter((id) => !existingIds.includes(id));

  const toRemove = existingIds.filter((id) => !incomingIds.includes(id));

  if (toAdd.length > 0) {
    await MeetingParticipant.insertMany(
      toAdd.map((userId) => ({
        meetingId,
        userId,
      })),
    );
  }

  if (toRemove.length > 0) {
    await MeetingParticipant.deleteMany({
      meetingId,

      userId: {
        $in: toRemove,
      },
    });
  }
}
