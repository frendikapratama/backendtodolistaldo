import Meeting from "../models/Meeting.js";

export const updateMeetingStatuses = async (io) => {
  const now = new Date();

  const toInProgress = await Meeting.updateMany(
    { status: "scheduled", startTime: { $lte: now }, endTime: { $gt: now } },
    { $set: { status: "in_progress" } },
  );

  const toCompleted = await Meeting.updateMany(
    { status: "in_progress", endTime: { $lte: now } },
    { $set: { status: "completed" } },
  );

  if (io && (toInProgress.modifiedCount > 0 || toCompleted.modifiedCount > 0)) {
    io.emit("meeting:statusUpdated");
  }
};
