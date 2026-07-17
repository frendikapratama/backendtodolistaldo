import { transporter } from "../utils/sendEmail.js";

// ─── Helpers

const fmt = (d) =>
  new Date(d)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

// Format waktu Asia/Jakarta untuk DTSTART/DTEND;TZID=Asia/Jakarta
const fmtLocal = (d) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(d));

  const get = (type) =>
    parts.find((p) => p.type === type)?.value?.padStart(2, "0") ?? "00";

  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
};
// Escape karakter khusus RFC 5545 — Outlook gagal parse jika tidak di-escape
const escapeICS = (text = "") =>
  String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");

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

const duration = (s, e) => {
  const m = Math.round((new Date(e) - new Date(s)) / 60000);
  const h = Math.floor(m / 60),
    r = m % 60;
  if (h > 0 && r > 0) return `${h} jam ${r} menit`;
  if (h > 0) return `${h} jam`;
  return `${r} menit`;
};

const snackLabels = {
  "makanan-ringan": "Makanan Ringan",
  "makanan-berat": "Makanan Berat",
};

const fmtSnackRequest = (snackRequest = []) => {
  if (!Array.isArray(snackRequest) || snackRequest.length === 0) return null;
  return snackRequest.map((s) => snackLabels[s] || s).join(", ");
};

// ─── ICS Generator

const generateICS = ({
  title,
  description,
  startTime,
  endTime,
  location,
  organizerName,
  senderEmail,
  meetingId,
  participants = [],
  meetingLink, // Tambahkan parameter ini
}) => {
  const sanitizeCN = (name) => {
    const cleaned = (name || "").replace(/"/g, "'").trim();
    return cleaned.includes(" ") || cleaned.includes(";")
      ? `"${cleaned}"`
      : cleaned;
  };

  const attendeeLines = participants.map(
    (p) =>
      `ATTENDEE;CUTYPE=INDIVIDUAL;CN=${sanitizeCN(p.nama || p.username)};RSVP=TRUE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:mailto:${p.email}`,
  );

  // Tambahkan meeting link ke description jika ada
  let fullDescription = description || "";
  if (meetingLink) {
    fullDescription += fullDescription
      ? `\\n\\nLink Meeting: ${meetingLink}`
      : `Link Meeting: ${meetingLink}`;
  }

  const foldLine = (line) => {
    if (line.length <= 75) return line;
    const parts = [];
    parts.push(line.substring(0, 75));
    let i = 75;
    while (i < line.length) {
      parts.push(" " + line.substring(i, i + 74));
      i += 74;
    }
    return parts.join("\r\n");
  };

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Planify//Meeting//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Jakarta",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0700",
    "TZOFFSETTO:+0700",
    "TZNAME:WIB",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:meeting-${meetingId}@planify.app`,
    `DTSTAMP:${fmt(new Date())}Z`,
    `CREATED:${fmt(new Date())}Z`,
    `DTSTART;TZID=Asia/Jakarta:${fmtLocal(startTime)}`,
    `DTEND;TZID=Asia/Jakarta:${fmtLocal(endTime)}`,
    `SUMMARY:${escapeICS(title)}`,
    `DESCRIPTION:${escapeICS(fullDescription)}`, // Description dengan link
    `LOCATION:${escapeICS(location)}`,
    `ORGANIZER;CN=${sanitizeCN(organizerName)}:mailto:${senderEmail}`,
    ...attendeeLines,
    "CLASS:PUBLIC",
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "TRANSP:OPAQUE",
    "X-MICROSOFT-CDO-BUSYSTATUS:BUSY",
    "X-MICROSOFT-CDO-INTENDEDSTATUS:BUSY",
    "X-MICROSOFT-CDO-IMPORTANCE:1",
    "X-MICROSOFT-CDO-ALLDAYEVENT:FALSE",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder: Meeting starts in 30 minutes",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldLine).join("\r\n");
};

// ─── RSVP Buttons ───────────────────────────────────────────────────────────
const buildRSVPButtons = (meetingId, participantEmail) => {
  let base = process.env.VITE_API_URL || "https://planify.itvault.cloud/api";

  if (!base.startsWith("http")) {
    base = "https://" + base;
  }

  const createToken = (status) => {
    const statusMap = { accepted: "a", tentative: "t", decline: "d" };
    const idBuf = Buffer.from(String(meetingId), "hex");
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

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px; border-collapse: collapse;">
  <tr>
    <!-- Menambahkan padding-bottom agar ada jarak aman sebelum komponen di bawahnya -->
    <td style="padding-bottom: 28px;">
      <p style="margin:0 0 16px; font-size:15px; font-weight:600; color:#0F172A; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        Apakah Anda akan menghadiri meeting ini?
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
        <tr>
          <!-- Tombol Hadir -->
          <td style="padding-right:12px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: separate;">
              <tr>
                <td align="center" valign="middle" bgcolor="#2563EB" style="border-radius: 22px; padding: 12px 24px;">
                  <a href="${accepted}" target="_blank" style="font-size: 14px; font-family: Arial, sans-serif; font-weight: 600; color: #ffffff; text-decoration: none; display: inline-block;">
                    Hadir
                  </a>
                </td>
              </tr>
            </table>
          </td>

          <!-- Tombol Mungkin -->
          <td style="padding-right:12px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: separate;">
              <tr>
                <td align="center" valign="middle" bgcolor="#F3F4F6" style="border-radius: 22px; border: 1px solid #D1D5DB; padding: 11px 23px;">
                  <a href="${tentative}" target="_blank" style="font-size: 14px; font-family: Arial, sans-serif; font-weight: 600; color: #374151; text-decoration: none; display: inline-block;">
                    Mungkin
                  </a>
                </td>
              </tr>
            </table>
          </td>

          <!-- Tombol Tidak Hadir -->
          <td>
            <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: separate;">
              <tr>
                <td align="center" valign="middle" bgcolor="#ffffff" style="border-radius: 22px; border: 1px solid #FCA5A5; padding: 11px 23px;">
                  <a href="${decline}" target="_blank" style="font-size: 14px; font-family: Arial, sans-serif; font-weight: 600; color: #DC2626; text-decoration: none; display: inline-block;">
                    Tidak Hadir
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;
};

// ─── Plain Text Builder

const buildPlainText = ({
  nama,
  meeting,
  room,
  organizer,
  isParticipant,
  isReminder = false,
  reminderText,
}) => {
  // Tambahkan meetingLink jika ada
  const meetingLinkText = meeting.meetingLink
    ? [``, `Link Meeting: ${meeting.meetingLink}`, ``]
    : [];

  const snackText = !isParticipant
    ? fmtSnackRequest(meeting.snackRequest)
    : null;

  return [
    isReminder
      ? `Pengingat Meeting: ${meeting.title}`
      : `Undangan Meeting: ${meeting.title}`,
    "",
    `Halo ${nama},`,
    isParticipant
      ? `${organizer.nama || organizer.username} telah mengundang Anda ke sebuah meeting.`
      : `Pemberitahuan: ${organizer.nama || organizer.username} telah menjadwalkan meeting yang membutuhkan perhatian departemen Anda.`,
    "",
    isReminder && reminderText ? reminderText : null,
    "",
    `Waktu: ${fmtDate(meeting.startTime)} – ${fmtDate(meeting.endTime)}`,
    `Durasi: ${duration(meeting.startTime, meeting.endTime)}`,
    `Ruangan: ${room?.nama || "—"}`,
    ...meetingLinkText, // Tambahkan link meeting di sini
    snackText ? `Snack Request: ${snackText}` : null,
    meeting.description ? `Detail: ${meeting.description}` : null,
    "",
    isParticipant
      ? "Buka email ini di Outlook dan gunakan Hadir/Tidak Hadir untuk menambahkannya ke kalender Anda."
      : "",
  ]
    .filter(Boolean)
    .join("\r\n");
};

// ─── HTML Builder

const buildHTML = ({
  nama,
  meeting,
  room,
  organizer,
  totalParticipants,
  participantEmail,
  isParticipant,
  isReminder = false,
  reminderText,
}) => {
  // Tambahkan meetingLink jika ada
  const meetingLinkHTML = meeting.meetingLink
    ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr>
        <td width="100%" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:16px;vertical-align:top;">
          <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">Link Meeting</p>
          <p style="margin:0;font-size:14px;font-weight:600;color:#2563EB;word-break:break-all;">
            <a href="${meeting.meetingLink}" style="color:#2563EB;text-decoration:underline;">${meeting.meetingLink}</a>
          </p>
        </td>
      </tr>
    </table>
  `
    : "";

  const snackText = !isParticipant
    ? fmtSnackRequest(meeting.snackRequest)
    : null;
  const snackHTML = snackText
    ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td width="100%" style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:16px;vertical-align:top;">
          <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#92400E;font-weight:700;">Snack Request</p>
          <p style="margin:0;font-size:14px;font-weight:600;color:#92400E;">${snackText}</p>
        </td>
      </tr>
    </table>
  `
    : "";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;padding:40px 16px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;text-align:left;">

      <tr>
        <td style="padding:0 0 32px 0;">
          <p style="margin:0 0 6px 0;color:#4F46E5;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">Planify</p>
          <h1 style="margin:0 0 6px 0;color:#0F172A;font-size:26px;font-weight:700;letter-spacing:-0.5px;line-height:1.2;">Undangan Meeting</h1>
          <p style="margin:0;color:#475569;font-size:15px;">${isParticipant ? "Anda telah diundang sebagai partisipan" : "Pemberitahuan untuk departemen Anda"}</p>
        </td>
      </tr>

      <tr>
        <td style="padding:0 0 32px 0;">

          <p style="margin:0 0 6px 0;font-size:15px;color:#0F172A;">Halo, <strong style="color:#0F172A;">${nama}</strong></p>
          <p style="margin:0 0 16px 0;font-size:15px;color:#475569;line-height:1.6;">
            <strong style="color:#4F46E5;">${organizer.nama || organizer.username}</strong>
            ${isParticipant ? "telah menjadwalkan meeting dan Anda diundang untuk berpartisipasi." : "telah menjadwalkan meeting yang membutuhkan perhatian departemen Anda."}
          </p>

          ${isReminder && reminderText ? `<div style="margin:0 0 24px 0;padding:14px 16px;border-left:4px solid #F59E0B;background:#FFFBEB;border-radius:8px;"><p style="margin:0;font-size:14px;color:#92400E;line-height:1.6;"><strong>Pengingat:</strong> ${reminderText}</p></div>` : ""}

          <hr style="border:none;border-top:1px solid #E2E8F0;margin:0 0 32px 0;"/>

          <h2 style="margin:0 0 6px 0;font-size:20px;font-weight:700;color:#0F172A;letter-spacing:-0.3px;">${meeting.title}</h2>
          ${
            meeting.description
              ? `<p style="margin:0 0 24px 0;font-size:15px;color:#475569;line-height:1.6;">${meeting.description}</p>`
              : `<div style="margin-bottom:24px;"></div>`
          }

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
            <tr>
              <td width="48%" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:16px;vertical-align:top;">
                <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">Mulai</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#1E293B;line-height:1.5;">${fmtDate(meeting.startTime)}</p>
              </td>
              <td width="4%"></td>
              <td width="48%" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:16px;vertical-align:top;">
                <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">Selesai</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#1E293B;line-height:1.5;">${fmtDate(meeting.endTime)}</p>
              </td>
            </tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
            <tr>
              <td width="48%" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:16px;vertical-align:top;">
                <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">Durasi</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#1E293B;">${duration(meeting.startTime, meeting.endTime)}</p>
              </td>
              <td width="4%"></td>
              <td width="48%" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:16px;vertical-align:top;">
                <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">Ruangan</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#1E293B;">${room?.nama || "&mdash;"}</p>
              </td>
            </tr>
          </table>

          ${meetingLinkHTML} <!-- Tambahkan link meeting di sini -->
          ${snackHTML} <!-- Snack request untuk non-participant -->

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td width="48%" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:16px;vertical-align:top;">
                <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">Penyelenggara</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#1E293B;">${organizer.nama || organizer.username}</p>
              </td>
              <td width="4%"></td>
              <td width="48%" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:16px;vertical-align:top;">
                <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">Partisipan</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#1E293B;">${totalParticipants} orang</p>
              </td>
            </tr>
          </table>

          ${isParticipant ? buildRSVPButtons(meeting._id, participantEmail) : ""}

          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#F8FAFC;border-left:4px solid #4F46E5;border-radius:0 8px 8px 0;padding:16px 20px;">
                <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">
                  <strong>Undangan kalender terlampir</strong><br/>
                  Buka file <strong>.ics</strong> untuk menambahkan meeting ini ke Google Calendar, Outlook,
                  atau Apple Calendar.
                </p>
              </td>
            </tr>
          </table>

        </td>
      </tr>

      <tr>
        <td style="border-top:1px solid #E2E8F0;padding:24px 0 0 0;text-align:center;">
          <p style="margin:0 0 4px 0;font-size:13px;color:#64748B;">
            Dikirim secara otomatis oleh <strong style="color:#4F46E5;">Planify</strong>.
          </p>
          <p style="margin:0;font-size:12px;color:#94A3B8;">Mohon untuk tidak membalas email ini.</p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>
`;
};

// ─── Main Export

export const sendMeetingInvitation = async ({
  participants,
  organizer,
  meeting,
  room,
  isReminder = false,
  reminderText = null,
}) => {
  const senderEmail = process.env.EMAIL_USER;

  // BARU: hanya hitung peserta asli (isParticipant true), bukan seluruh penerima notifikasi (termasuk FYI/IT)
  const totalParticipants = participants.filter((p) => p.isParticipant).length;

  const safeTitle = meeting.title.replace(/\s+/g, "-").replace(/[^\w-]/g, "");

  const results = await Promise.allSettled(
    participants.map(({ email, nama, isParticipant }) => {
      const icsContent = generateICS({
        title: meeting.title,
        description: meeting.description,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        location: room?.nama || "",
        organizerName: organizer.nama || organizer.username,
        senderEmail,
        meetingId: meeting._id,
        participants: [{ email, nama }],
        meetingLink: meeting.meetingLink, // Kirim meetingLink
      });

      const htmlContent = buildHTML({
        nama,
        meeting,
        room,
        organizer,
        totalParticipants,
        participantEmail: email,
        isParticipant,
        isReminder,
        reminderText,
      });

      return transporter.sendMail({
        from: `"Planify" <${process.env.EMAIL_USER}>`,
        to: email,
        replyTo: `"${organizer.nama || organizer.username}" <${organizer.email}>`,
        subject: isReminder
          ? `[Pengingat Meeting] ${meeting.title}`
          : `[Undangan Meeting] ${meeting.title}`,
        headers: {
          "Content-Class": "urn:content-classes:calendarmessage",
          "X-MS-OLK-FORCEINSPECTOROPEN": "TRUE",
        },
        text: buildPlainText({
          nama,
          meeting,
          room,
          organizer,
          isParticipant,
          isReminder,
          reminderText,
        }),
        html: htmlContent,
        icalEvent: {
          method: "REQUEST",
          filename: `${safeTitle}.ics`,
          content: icsContent,
        },
      });
    }),
  );

  results.forEach((r, i) => {
    if (r.status === "rejected")
      console.error(
        `✗ Failed  →  ${participants[i].email}:`,
        r.reason?.message || r.reason,
      );
    else console.log(`✓ Sent    →  ${participants[i].email}`);
  });

  return results;
};

export const sendMeetingCancellationEmail = async ({
  users,
  meeting,
  canceller,
  cancelledReason,
}) => {
  const results = await Promise.allSettled(
    users.map(({ email, nama, username, isParticipant }) => {
      const recipientName = nama || username;
      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
</head>
<body style="margin:0;padding:0;background:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;text-align:left;">
        <tr>
          <td style="padding:0 0 32px 0;">
            <p style="margin:0 0 6px 0;color:#DC2626;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">Planify</p>
            <h1 style="margin:0 0 6px 0;color:#0F172A;font-size:26px;font-weight:700;letter-spacing:-0.5px;line-height:1.2;">Meeting Dibatalkan</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 32px 0;">
            <p style="margin:0 0 6px 0;font-size:15px;color:#0F172A;">Halo, <strong style="color:#0F172A;">${recipientName}</strong></p>
            <p style="margin:0 0 16px 0;font-size:15px;color:#475569;line-height:1.6;">
              ${isParticipant ? `Meeting <strong style="color:#0F172A;">${meeting.title}</strong> telah dibatalkan oleh <strong style="color:#4F46E5;">${canceller?.nama || canceller?.username || "Admin"}</strong>.` : `Pemberitahuan: Meeting <strong style="color:#0F172A;">${meeting.title}</strong> yang membutuhkan dukungan departemen Anda telah dibatalkan oleh <strong style="color:#4F46E5;">${canceller?.nama || canceller?.username || "Admin"}</strong>.`}
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
              <tr>
                <td width="48%" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:16px;vertical-align:top;">
                  <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">Alasan</p>
                  <p style="margin:0;font-size:14px;font-weight:600;color:#1E293B;line-height:1.5;">${cancelledReason || "Tidak ada alasan yang diberikan"}</p>
                </td>
                <td width="4%"></td>
                <td width="48%" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:16px;vertical-align:top;">
                  <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">Ruangan</p>
                  <p style="margin:0;font-size:14px;font-weight:600;color:#1E293B;line-height:1.5;">${meeting.roomId?.nama || "&mdash;"}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="border-top:1px solid #E2E8F0;padding:24px 0 0 0;text-align:center;">
            <p style="margin:0 0 4px 0;font-size:13px;color:#64748B;">
              Dikirim secara otomatis oleh <strong style="color:#DC2626;">Planify</strong>.
            </p>
            <p style="margin:0;font-size:12px;color:#94A3B8;">Mohon untuk tidak membalas email ini.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      return transporter.sendMail({
        from: `"Planify" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `[Meeting Dibatalkan] ${meeting.title}`,
        html: htmlContent,
      });
    }),
  );

  results.forEach((r, i) => {
    if (r.status === "rejected")
      console.error(
        `✗ Failed Cancel Email  →  ${users[i].email}:`,
        r.reason?.message || r.reason,
      );
    else console.log(`✓ Sent Cancel Email    →  ${users[i].email}`);
  });

  return results;
};

export const sendMeetingRescheduleEmail = async ({
  users,
  meeting,
  room,
  rescheduler,
  oldData,
}) => {
  const senderEmail = process.env.EMAIL_USER;

  const results = await Promise.allSettled(
    users.map(({ email, nama, username, isParticipant }) => {
      const recipientName = nama || username;
      const organizer = meeting.organizerId || {};

      const icsContent = generateICS({
        title: meeting.title,
        description: meeting.description,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        location: room?.nama || "",
        organizerName:
          organizer.nama ||
          organizer.username ||
          rescheduler?.nama ||
          rescheduler?.username ||
          "Admin",
        senderEmail,
        meetingId: meeting._id,
        participants: [{ email, nama: recipientName }],
        meetingLink: meeting.meetingLink, // Kirim meetingLink
      });

      // Tambahkan meetingLink ke HTML reschedule
      const meetingLinkHTML = meeting.meetingLink
        ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
          <tr>
            <td width="100%" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:16px;vertical-align:top;">
              <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">Link Meeting</p>
              <p style="margin:0;font-size:14px;font-weight:600;color:#2563EB;word-break:break-all;">
                <a href="${meeting.meetingLink}" style="color:#2563EB;text-decoration:underline;">${meeting.meetingLink}</a>
              </p>
            </td>
          </tr>
        </table>
      `
        : "";

      const snackText = !isParticipant
        ? fmtSnackRequest(meeting.snackRequest)
        : null;
      const snackHTML = snackText
        ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <td width="100%" style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:16px;vertical-align:top;">
              <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#92400E;font-weight:700;">Snack Request</p>
              <p style="margin:0;font-size:14px;font-weight:600;color:#92400E;">${snackText}</p>
            </td>
          </tr>
        </table>
      `
        : "";

      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
</head>
<body style="margin:0;padding:0;background:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;text-align:left;">
        <tr>
          <td style="padding:0 0 32px 0;">
            <p style="margin:0 0 6px 0;color:#F59E0B;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">Planify</p>
            <h1 style="margin:0 0 6px 0;color:#0F172A;font-size:26px;font-weight:700;letter-spacing:-0.5px;line-height:1.2;">Jadwal Meeting Diubah</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 32px 0;">
            <p style="margin:0 0 6px 0;font-size:15px;color:#0F172A;">Halo, <strong style="color:#0F172A;">${recipientName}</strong></p>
            <p style="margin:0 0 16px 0;font-size:15px;color:#475569;line-height:1.6;">
              ${isParticipant ? `Jadwal meeting <strong style="color:#0F172A;">${meeting.title}</strong> telah diubah oleh <strong style="color:#4F46E5;">${rescheduler?.nama || rescheduler?.username || "Admin"}</strong>.` : `Pemberitahuan: Jadwal meeting <strong style="color:#0F172A;">${meeting.title}</strong> yang terkait dengan departemen Anda telah diubah oleh <strong style="color:#4F46E5;">${rescheduler?.nama || rescheduler?.username || "Admin"}</strong>.`}
            </p>
            
            <h2 style="margin:0 0 6px 0;font-size:16px;font-weight:700;color:#0F172A;">Jadwal Baru</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
              <tr>
                <td width="48%" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:16px;vertical-align:top;">
                  <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">Mulai</p>
                  <p style="margin:0;font-size:14px;font-weight:600;color:#1E293B;line-height:1.5;">${fmtDate(meeting.startTime)}</p>
                </td>
                <td width="4%"></td>
                <td width="48%" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:16px;vertical-align:top;">
                  <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">Selesai</p>
                  <p style="margin:0;font-size:14px;font-weight:600;color:#1E293B;line-height:1.5;">${fmtDate(meeting.endTime)}</p>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
              <tr>
                <td width="100%" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:16px;vertical-align:top;">
                  <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">Ruangan Baru</p>
                  <p style="margin:0;font-size:14px;font-weight:600;color:#1E293B;line-height:1.5;">${room?.nama || "&mdash;"}</p>
                </td>
              </tr>
            </table>

            ${meetingLinkHTML} <!-- Tambahkan link meeting di sini -->
            ${snackHTML} <!-- Snack request untuk non-participant -->

          </td>
        </tr>
        <tr>
          <td style="border-top:1px solid #E2E8F0;padding:24px 0 0 0;text-align:center;">
            <p style="margin:0 0 4px 0;font-size:13px;color:#64748B;">
              Dikirim secara otomatis oleh <strong style="color:#F59E0B;">Planify</strong>.
            </p>
            <p style="margin:0;font-size:12px;color:#94A3B8;">Mohon untuk tidak membalas email ini.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      const safeTitle = meeting.title
        .replace(/\s+/g, "-")
        .replace(/[^\w-]/g, "");

      return transporter.sendMail({
        from: `"Planify" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `[Jadwal Meeting Diubah] ${meeting.title}`,
        html: htmlContent,
        icalEvent: {
          method: "REQUEST",
          filename: `${safeTitle}-reschedule.ics`,
          content: icsContent,
        },
      });
    }),
  );

  results.forEach((r, i) => {
    if (r.status === "rejected")
      console.error(
        `✗ Failed Reschedule Email  →  ${users[i].email}:`,
        r.reason?.message || r.reason,
      );
    else console.log(`✓ Sent Reschedule Email    →  ${users[i].email}`);
  });

  return results;
};
