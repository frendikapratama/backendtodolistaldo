import { sendWhatsAppMessage } from "../utils/whatsapp.js";

const fmtDate = (d) =>
  new Date(d).toLocaleString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }) + " WIB";

const buildMeetingMessage = ({
  nama,
  meeting,
  room,
  organizer,
  participantEmail,
}) => {
  const base = process.env.VITE_API_URL || "http://localhost:5000";
  const encoded = encodeURIComponent(participantEmail);

  const accepted = `${base}/api/meeting/rsvp/${meeting._id}?status=accepted&email=${encoded}`;
  const tentative = `${base}/api/meeting/rsvp/${meeting._id}?status=tentative&email=${encoded}`;
  const decline = `${base}/api/meeting/rsvp/${meeting._id}?status=decline&email=${encoded}`;

  return [
    "🗓️*Meeting Invitation - Planify*",
    "",
    `Halo *${nama}*,`,
    "",
    `Anda diundang oleh *${organizer.nama || organizer.username}* untuk menghadiri meeting berikut.`,
    "",
    `📌 *${meeting.title}*`,
    meeting.description ? `📝 ${meeting.description}` : null,
    "",
    `🕒 *Mulai*`,
    `${fmtDate(meeting.startTime)}`,
    "",
    `🕒 *Selesai*`,
    `${fmtDate(meeting.endTime)}`,
    "",
    `📍 *Ruangan*`,
    `${room?.nama || "-"}`,
    "",

    "",
    "Silakan konfirmasi kehadiran Anda:",
    "",
    `✅ *Accept*`,
    accepted,
    "",
    `❓ *Tentative*`,
    tentative,
    "",
    `❌ *Decline*`,
    decline,
    "",
    "_Klik salah satu link di atas untuk memberikan respon._",
    "",
    "Terima kasih.",
    "",
    "— *Planify*",
  ]
    .filter(Boolean)
    .join("\n");
};

export const sendMeetingWhatsAppNotification = async ({
  participants,
  organizer,
  meeting,
  room,
}) => {
  const validParticipants = participants.filter((p) => p.noHp && p.email);

  const results = await Promise.allSettled(
    validParticipants.map((participant) => {
      const message = buildMeetingMessage({
        nama: participant.nama,
        meeting,
        room,
        organizer,
        participantEmail: participant.email,
      });

      return sendWhatsAppMessage(participant.noHp, message);
    }),
  );

  results.forEach((result, index) => {
    const participant = validParticipants[index];

    if (result.status === "rejected" || result.value?.success === false) {
      console.error(
        `✗ WA gagal → ${participant.noHp}:`,
        result.reason?.message || result.value?.reason,
      );
    } else {
      console.log(`✓ WA terkirim → ${participant.noHp}`);
    }
  });

  return results;
};
