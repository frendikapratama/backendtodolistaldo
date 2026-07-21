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

const snackLabels = {
  "makanan-ringan": "Makanan Ringan",
  "makanan-berat": "Makanan Berat",
};

const fmtSnackRequest = (snackRequest = []) => {
  if (!Array.isArray(snackRequest) || snackRequest.length === 0) return null;
  return snackRequest.map((s) => snackLabels[s] || s).join(", ");
};

const getPublicBaseUrl = () => {
  const rawBase = process.env.VITE_API_URL || "https://planify.itvault.cloud";
  return String(rawBase).trim().replace(/\/+$/, "");
};

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
  const base = getPublicBaseUrl();
  const baseApiUrl = `${base}/api`;

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

  const accepted = `${baseApiUrl}/meeting/rsvp/${createToken("accepted")}`;
  const tentative = `${baseApiUrl}/meeting/rsvp/${createToken("tentative")}`;
  const decline = `${baseApiUrl}/meeting/rsvp/${createToken("decline")}`;

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

  const snackText = !isParticipant
    ? fmtSnackRequest(meeting.snackRequest)
    : null;

  const snackLines = snackText ? [`🍿 *Snack Request*`, snackText, ""] : [];
  const meetingLinkLines = meeting.meetingLink
    ? ["", `🔗 *Link Meeting*`, meeting.meetingLink, ""]
    : [];

  return [
    isReminder
      ? "🗓️*Pengingat Meeting - Planify*"
      : "🗓️*Undangan Meeting - Planify*",
    "",
    "",
    `Halo *${nama}*,`,
    "",
    "",
    isParticipant
      ? `Anda diundang oleh *${organizer.nama || organizer.username}* untuk menghadiri meeting berikut.`
      : `Pemberitahuan: *${organizer.nama || organizer.username}* telah menjadwalkan meeting yang membutuhkan dukungan departemen Anda.`,
    "",
    "",
    ...reminderLine,
    `📌 *${meeting.title}*`,
    meeting.description ? `📝 ${meeting.description}` : null,
    "",
    "",
    `🕒 *Mulai*`,
    `${fmtDate(meeting.startTime)}`,
    "",
    `🕒 *Selesai*`,
    `${fmtDate(meeting.endTime)}`,
    "",
    `📍 *Ruangan*`,
    `${room?.nama || "-"}`,
    ...meetingLinkLines,
    ...snackLines,
    "",
    "",
    // ...rsvpLines,
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

  if (validParticipants.length === 0) {
    console.log("Tidak ada peserta valid untuk dikirim notifikasi WA");
    return [];
  }

  const results = [];

  for (let i = 0; i < validParticipants.length; i++) {
    const participant = validParticipants[i];

    try {
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

      console.log(
        `📤 Mengirim WA ke ${participant.noHp} (${i + 1}/${validParticipants.length})`,
      );

      const result = await sendWhatsAppMessage(participant.noHp, message);

      if (result?.success === false) {
        console.error(
          `✗ WA gagal → ${participant.noHp}:`,
          result.reason || "Unknown error",
        );
        results.push({
          status: "rejected",
          value: result,
          participant: participant.noHp,
        });
      } else {
        console.log(`✓ WA terkirim → ${participant.noHp}`);
        results.push({
          status: "fulfilled",
          value: result,
          participant: participant.noHp,
        });
      }
    } catch (error) {
      console.error(`✗ WA error → ${participant.noHp}:`, error.message);
      results.push({
        status: "rejected",
        reason: error,
        participant: participant.noHp,
      });
    }

    if (i < validParticipants.length - 1) {
      const delay = Math.floor(Math.random() * 30000) + 15000; // 15-45 detik
      console.log(
        `⏳ Menunggu ${Math.round(delay / 1000)} detik sebelum kirim berikutnya...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return results;
};

export const sendMeetingCancellationWhatsApp = async ({
  users,
  meeting,
  canceller,
  cancelledReason,
}) => {
  const validUsers = users.filter((p) => p.noHp);

  if (validUsers.length === 0) {
    console.log("Tidak ada user valid untuk notifikasi pembatalan WA");
    return [];
  }

  const results = [];

  for (let i = 0; i < validUsers.length; i++) {
    const user = validUsers[i];

    try {
      const meetingLinkLines = meeting.meetingLink
        ? ["", `🔗 *Link Meeting*`, meeting.meetingLink, ""]
        : [];

      const message = [
        "🚫 *Meeting Dibatalkan - Planify*",
        "",
        "",
        `Halo *${user.nama || user.username}*,`,
        "",
        "",
        user.isParticipant
          ? `Meeting berikut telah dibatalkan oleh *${canceller?.nama || canceller?.username || "Admin"}*.`
          : `Pemberitahuan: Meeting yang membutuhkan dukungan departemen Anda berikut telah dibatalkan oleh *${canceller?.nama || canceller?.username || "Admin"}*.`,
        "",
        "",
        `📌 *${meeting.title}*`,
        "",
        `🕒 *Jadwal*`,
        `${fmtDate(meeting.startTime)} - ${fmtDate(meeting.endTime)}`,
        "",
        `📍 *Ruangan*`,
        `${meeting.roomId?.nama || "-"}`,
        ...meetingLinkLines,
        "",
        "",
        `📝 *Alasan Pembatalan*`,
        `${cancelledReason || "-"}`,
        "",
        "",
        "Terima kasih.",
        "",
        "— *Planify*",
      ].join("\n");

      console.log(
        `📤 Mengirim WA pembatalan ke ${user.noHp} (${i + 1}/${validUsers.length})`,
      );

      const result = await sendWhatsAppMessage(user.noHp, message);

      if (result?.success === false) {
        console.error(
          `✗ WA Cancel gagal → ${user.noHp}:`,
          result.reason || "Unknown error",
        );
        results.push({
          status: "rejected",
          value: result,
          user: user.noHp,
        });
      } else {
        console.log(`✓ WA Cancel terkirim → ${user.noHp}`);
        results.push({
          status: "fulfilled",
          value: result,
          user: user.noHp,
        });
      }
    } catch (error) {
      console.error(`✗ WA Cancel error → ${user.noHp}:`, error.message);
      results.push({
        status: "rejected",
        reason: error,
        user: user.noHp,
      });
    }

    // Jeda acak 15-45 detik
    if (i < validUsers.length - 1) {
      const delay = Math.floor(Math.random() * 30000) + 15000;
      console.log(
        `⏳ Menunggu ${Math.round(delay / 1000)} detik sebelum kirim berikutnya...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

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

  if (validUsers.length === 0) {
    console.log("Tidak ada user valid untuk notifikasi reschedule WA");
    return [];
  }

  const results = [];

  for (let i = 0; i < validUsers.length; i++) {
    const user = validUsers[i];

    try {
      const meetingLinkLines = meeting.meetingLink
        ? ["", `🔗 *Link Meeting*`, meeting.meetingLink, ""]
        : [];

      const message = [
        "🔄 *Jadwal Meeting Diubah - Planify*",
        "",
        "",
        `Halo *${user.nama || user.username}*,`,
        "",
        "",
        user.isParticipant
          ? `Jadwal meeting berikut telah diubah oleh *${rescheduler?.nama || rescheduler?.username || "Admin"}*.`
          : `Pemberitahuan: Jadwal meeting yang terkait dengan departemen Anda berikut telah diubah oleh *${rescheduler?.nama || rescheduler?.username || "Admin"}*.`,
        "",
        "",
        `📌 *${meeting.title}*`,
        "",
        "",
        `🕒 *Jadwal Baru*`,
        `${fmtDate(meeting.startTime)} - ${fmtDate(meeting.endTime)}`,
        "",
        `📍 *Ruangan Baru*`,
        `${room?.nama || "-"}`,
        ...meetingLinkLines,
        "",
        "",
        "Terima kasih.",
        "",
        "— *Planify*",
      ].join("\n");

      console.log(
        `📤 Mengirim WA reschedule ke ${user.noHp} (${i + 1}/${validUsers.length})`,
      );

      const result = await sendWhatsAppMessage(user.noHp, message);

      if (result?.success === false) {
        console.error(
          `✗ WA Reschedule gagal → ${user.noHp}:`,
          result.reason || "Unknown error",
        );
        results.push({
          status: "rejected",
          value: result,
          user: user.noHp,
        });
      } else {
        console.log(`✓ WA Reschedule terkirim → ${user.noHp}`);
        results.push({
          status: "fulfilled",
          value: result,
          user: user.noHp,
        });
      }
    } catch (error) {
      console.error(`✗ WA Reschedule error → ${user.noHp}:`, error.message);
      results.push({
        status: "rejected",
        reason: error,
        user: user.noHp,
      });
    }

    // Jeda acak 15-45 detik
    if (i < validUsers.length - 1) {
      const delay = Math.floor(Math.random() * 30000) + 15000;
      console.log(
        `⏳ Menunggu ${Math.round(delay / 1000)} detik sebelum kirim berikutnya...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return results;
};
