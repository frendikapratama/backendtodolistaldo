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
        "Silakan konfirmasi kehadiran Anda:\n",
        `✅ *Hadir*\n${accepted}\n`,
        `❓ *Mungkin*\n${tentative}\n`,
        `❌ *Tidak Hadir*\n${decline}\n`,
        "_\nKlik salah satu link di atas untuk memberikan respon._",
      ]
    : [];

  const reminderLine =
    isReminder && reminderText ? `⏰ *Pengingat*\n${reminderText}` : null;

  const snackText = !isParticipant
    ? fmtSnackRequest(meeting.snackRequest)
    : null;
  const snackLines = snackText ? `🍿 *Snack Request*\n${snackText}` : null;
  const meetingLinkLines = meeting.meetingLink
    ? `🔗 *Link Meeting*\n${meeting.meetingLink}`
    : null;

  const header = isReminder
    ? "🗓️ *Pengingat Meeting - Planify*"
    : "🗓️ *Undangan Meeting - Planify*";
  const bodyText = isParticipant
    ? `Anda diundang oleh *${organizer.nama || organizer.username}* untuk menghadiri meeting berikut.`
    : `Pemberitahuan: *${organizer.nama || organizer.username}* telah menjadwalkan meeting yang membutuhkan dukungan departemen Anda.`;

  // Gabungkan antar-blok paragraf menggunakan ganda \n\n agar ada spasi antar baris
  return [
    header,
    `Halo *${nama}*,`,
    bodyText,
    reminderLine,
    `📌 *${meeting.title}*${meeting.description ? `\n📝 ${meeting.description}` : ""}`,
    `🕒 *Mulai*\n${fmtDate(meeting.startTime)}`,
    `🕒 *Selesai*\n${fmtDate(meeting.endTime)}`,
    `📍 *Ruangan*\n${room?.nama || "-"}`,
    meetingLinkLines,
    snackLines,
    // ...rsvpLines,
    "Terima kasih.\n\n— *Planify*",
  ]
    .filter(Boolean)
    .join("\n\n"); // Menggunakan \n\n untuk memberikan 1 baris kosong antar paragraf
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
        ? `🔗 *Link Meeting*\n${meeting.meetingLink}`
        : null;

      const bodyText = user.isParticipant
        ? `Meeting berikut telah dibatalkan oleh *${canceller?.nama || canceller?.username || "Admin"}*.`
        : `Pemberitahuan: Meeting yang membutuhkan dukungan departemen Anda berikut telah dibatalkan oleh *${canceller?.nama || canceller?.username || "Admin"}*.`;

      const message = [
        "🚫 *Meeting Dibatalkan - Planify*",
        `Halo *${user.nama || user.username}*,`,
        bodyText,
        `📌 *${meeting.title}*`,
        `🕒 *Jadwal*\n${fmtDate(meeting.startTime)} - ${fmtDate(meeting.endTime)}`,
        `📍 *Ruangan*\n${meeting.roomId?.nama || "-"}`,
        meetingLinkLines,
        `📝 *Alasan Pembatalan*\n${cancelledReason || "-"}`,
        "Terima kasih.\n\n— *Planify*",
      ]
        .filter(Boolean)
        .join("\n\n");

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
        ? `🔗 *Link Meeting*\n${meeting.meetingLink}`
        : null;

      const bodyText = user.isParticipant
        ? `Jadwal meeting berikut telah diubah oleh *${rescheduler?.nama || rescheduler?.username || "Admin"}*.`
        : `Pemberitahuan: Jadwal meeting yang terkait dengan departemen Anda berikut telah diubah oleh *${rescheduler?.nama || rescheduler?.username || "Admin"}*.`;

      const message = [
        "🔄 *Jadwal Meeting Diubah - Planify*",
        `Halo *${user.nama || user.username}*,`,
        bodyText,
        `📌 *${meeting.title}*`,
        `🕒 *Jadwal Baru*\n${fmtDate(meeting.startTime)} - ${fmtDate(meeting.endTime)}`,
        `📍 *Ruangan Baru*\n${room?.nama || "-"}`,
        meetingLinkLines,
        "Terima kasih.\n\n— *Planify*",
      ]
        .filter(Boolean)
        .join("\n\n");

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
