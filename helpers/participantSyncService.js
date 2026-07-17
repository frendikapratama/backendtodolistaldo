import MeetingParticipant from "../models/MeetingParticipant.js";

export async function syncParticipants(
  meetingId,
  participantIds,
  externalParticipants,
) {
  // ── Sync peserta internal (User)
  if (participantIds !== undefined) {
    const existing = await MeetingParticipant.find({
      meetingId,
      isExternal: false,
    });
    const existingIds = existing.map((item) => item.userId.toString());
    const incomingIds = participantIds.map((id) => id.toString());

    const toAdd = incomingIds.filter((id) => !existingIds.includes(id));
    const toRemove = existingIds.filter((id) => !incomingIds.includes(id));

    if (toAdd.length > 0) {
      await MeetingParticipant.insertMany(
        toAdd.map((userId) => ({ meetingId, userId })),
      );
    }
    if (toRemove.length > 0) {
      await MeetingParticipant.deleteMany({
        meetingId,
        userId: { $in: toRemove },
      });
    }
  }

  // ── Sync peserta eksternal (email/noHp saja)
  if (externalParticipants !== undefined) {
    const existingExternal = await MeetingParticipant.find({
      meetingId,
      isExternal: true,
    });
    const existingEmails = existingExternal.map((e) =>
      (e.externalEmail || "").toLowerCase(),
    );
    const incoming = externalParticipants.filter((e) => e.email);
    const incomingEmails = incoming.map((e) => e.email.toLowerCase());

    const toAdd = incoming.filter(
      (e) => !existingEmails.includes(e.email.toLowerCase()),
    );
    const toRemove = existingExternal.filter(
      (e) => !incomingEmails.includes((e.externalEmail || "").toLowerCase()),
    );

    if (toAdd.length > 0) {
      await MeetingParticipant.insertMany(
        toAdd.map((p) => ({
          meetingId,
          isExternal: true,
          externalName: p.name || p.email,
          externalEmail: p.email,
          externalNoHp: p.noHp || null,
        })),
      );
    }
    if (toRemove.length > 0) {
      await MeetingParticipant.deleteMany({
        _id: { $in: toRemove.map((e) => e._id) },
      });
    }
  }
}
