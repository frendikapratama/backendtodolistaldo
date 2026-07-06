import { sendWhatsAppMessage } from "../utils/whatsapp.js";

const fmtDate = (d) =>
  new Date(d).toLocaleString("id-ID", {
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
  isParticipant,
  isReminder = false,
  reminderText,
}) => {
  let base = process.env.VITE_API_URL || "https://planify.itvault.cloud/api";
  if (!base.startsWith("http")) {
    base = "https://" + base;
  }

  const createToken = (status) => {
    const statusMap = { accepted: "a", tentative: "t", decline: "d" };
    const idBuf = Buffer.from(String(meeting._id), "hex");
    const sBuf = Buffer.from(statusMap[status] || "t", "utf8");
    const eBuf = Buffer.from(participantEmail, "utf8");
    const combined = Buffer.concat([idBuf, sBuf, eBuf]);
    return combined
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  };

  const accepted = `${base}/api/meeting/rsvp/${createToken("accepted")}`;
  const tentative = `${base}/api/meeting/rsvp/${createToken("tentative")}`;
  const decline = `${base}/api/meeting/rsvp/${createToken("decline")}`;

  const rsvpLines = isParticipant
    ? [
        "Silakan konfirmasi kehadiran Anda:",
        "",
        `✅ *Hadir*`,
        accepted,
        "",
        `❓ *Mungkin*`,
        tentative,
        "",
        `❌ *Tidak Hadir*`,
        decline,
        "",
        "_Klik salah satu link di atas untuk memberikan respon._",
        "",
      ]
    : [];

  const reminderLine =
    isReminder && reminderText ? [`⏰ *Pengingat*`, reminderText, ""] : [];

  // Tambahkan meetingLink jika ada
  const meetingLinkLines = meeting.meetingLink
    ? ["", `🔗 *Link Meeting*`, meeting.meetingLink, ""]
    : [];

  return [
    isReminder
      ? "🗓️*Pengingat Meeting - Planify*"
      : "🗓️*Undangan Meeting - Planify*",
    "",
    `Halo *${nama}*,`,
    "",
    isParticipant
      ? `Anda diundang oleh *${organizer.nama || organizer.username}* untuk menghadiri meeting berikut.`
      : `Pemberitahuan: *${organizer.nama || organizer.username}* telah menjadwalkan meeting yang membutuhkan dukungan departemen Anda.`,
    "",
    ...reminderLine,
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
    ...meetingLinkLines, // Tambahkan link meeting di sini
    "",
    ...rsvpLines,
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
  isReminder = false,
  reminderText = null,
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
        isParticipant: participant.isParticipant,
        isReminder,
        reminderText,
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

export const sendMeetingCancellationWhatsApp = async ({
  users,
  meeting,
  canceller,
  cancelledReason,
}) => {
  const validUsers = users.filter((p) => p.noHp);

  const results = await Promise.allSettled(
    validUsers.map((user) => {
      // Tambahkan meetingLink jika ada
      const meetingLinkLines = meeting.meetingLink
        ? ["", `🔗 *Link Meeting*`, meeting.meetingLink, ""]
        : [];

      const message = [
        "🚫 *Meeting Dibatalkan - Planify*",
        "",
        `Halo *${user.nama || user.username}*,`,
        "",
        user.isParticipant
          ? `Meeting berikut telah dibatalkan oleh *${canceller?.nama || canceller?.username || "Admin"}*.`
          : `Pemberitahuan: Meeting yang membutuhkan dukungan departemen Anda berikut telah dibatalkan oleh *${canceller?.nama || canceller?.username || "Admin"}*.`,
        "",
        `📌 *${meeting.title}*`,
        "",
        `🕒 *Jadwal*`,
        `${fmtDate(meeting.startTime)} - ${fmtDate(meeting.endTime)}`,
        "",
        `📍 *Ruangan*`,
        `${meeting.roomId?.nama || "-"}`,
        ...meetingLinkLines, // Tambahkan link meeting di sini
        "",
        `📝 *Alasan Pembatalan*`,
        `${cancelledReason || "-"}`,
        "",
        "Terima kasih.",
        "",
        "— *Planify*",
      ].join("\n");

      return sendWhatsAppMessage(user.noHp, message);
    }),
  );

  results.forEach((result, index) => {
    const user = validUsers[index];

    if (result.status === "rejected" || result.value?.success === false) {
      console.error(
        `✗ WA Cancel gagal → ${user.noHp}:`,
        result.reason?.message || result.value?.reason,
      );
    } else {
      console.log(`✓ WA Cancel terkirim → ${user.noHp}`);
    }
  });

  return results;
};

export const sendMeetingRescheduleWhatsApp = async ({
  users,
  meeting,
  room,
  rescheduler,
  oldData,
}) => {
  const validUsers = users.filter((p) => p.noHp);

  const results = await Promise.allSettled(
    validUsers.map((user) => {
      // Tambahkan meetingLink jika ada
      const meetingLinkLines = meeting.meetingLink
        ? ["", `🔗 *Link Meeting*`, meeting.meetingLink, ""]
        : [];

      const message = [
        "🔄 *Jadwal Meeting Diubah - Planify*",
        "",
        `Halo *${user.nama || user.username}*,`,
        "",
        user.isParticipant
          ? `Jadwal meeting berikut telah diubah oleh *${rescheduler?.nama || rescheduler?.username || "Admin"}*.`
          : `Pemberitahuan: Jadwal meeting yang terkait dengan departemen Anda berikut telah diubah oleh *${rescheduler?.nama || rescheduler?.username || "Admin"}*.`,
        "",
        `📌 *${meeting.title}*`,
        "",
        `🕒 *Jadwal Baru*`,
        `${fmtDate(meeting.startTime)} - ${fmtDate(meeting.endTime)}`,
        "",
        `📍 *Ruangan Baru*`,
        `${room?.nama || "-"}`,
        ...meetingLinkLines, // Tambahkan link meeting di sini
        "",
        "Terima kasih.",
        "",
        "— *Planify*",
      ].join("\n");

      return sendWhatsAppMessage(user.noHp, message);
    }),
  );

  results.forEach((result, index) => {
    const user = validUsers[index];

    if (result.status === "rejected" || result.value?.success === false) {
      console.error(
        `✗ WA Reschedule gagal → ${user.noHp}:`,
        result.reason?.message || result.value?.reason,
      );
    } else {
      console.log(`✓ WA Reschedule terkirim → ${user.noHp}`);
    }
  });

  return results;
};
