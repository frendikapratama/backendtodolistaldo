import { transporter } from "../utils/sendEmail.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (d) =>
  new Date(d)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

// Format local WIB time tanpa Z — untuk DTSTART/DTEND dengan TZID
const fmtLocal = (d) => {
  const date = new Date(d);
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return wib
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "");
};

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

const duration = (s, e) => {
  const m = Math.round((new Date(e) - new Date(s)) / 60000);
  const h = Math.floor(m / 60),
    r = m % 60;
  if (h > 0 && r > 0) return `${h}h ${r}m`;
  if (h > 0) return `${h} hour${h > 1 ? "s" : ""}`;
  return `${r} min`;
};

// ─── ICS Generator ──────────────────────────────────────────────────────────

const generateICS = ({
  title,
  description,
  startTime,
  endTime,
  location,
  organizerEmail,
  organizerName,
  senderEmail,
  meetingId,
  participants = [],
}) => {
  // CN dengan spasi atau karakter khusus harus di-quote — wajib untuk Outlook
  const sanitizeCN = (name) => {
    const cleaned = (name || "").replace(/"/g, "'").trim();
    return cleaned.includes(" ") || cleaned.includes(";")
      ? `"${cleaned}"`
      : cleaned;
  };

  const attendeeLines = participants.map(
    (p) =>
      `ATTENDEE;CN=${sanitizeCN(p.nama || p.username)};RSVP=TRUE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:mailto:${p.email}`,
  );

  // Fold long lines per RFC 5545 (max 75 octets per line)
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
    // VTIMEZONE — wajib untuk Outlook agar tidak salah timezone
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Jakarta",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0700",
    "TZOFFSETTO:+0700",
    "TZNAME:WIB",
    "END:STANDARD",
    "END:VTIMEZONE",
    // VEVENT
    "BEGIN:VEVENT",
    `UID:meeting-${meetingId}@planify.app`,
    `DTSTAMP:${fmt(new Date())}Z`,
    `DTSTART;TZID=Asia/Jakarta:${fmtLocal(startTime)}`,
    `DTEND;TZID=Asia/Jakarta:${fmtLocal(endTime)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${(description || "").replace(/\n/g, "\\n")}`,
    `LOCATION:${location || ""}`,
    // ✅ Outlook WAJIB: ORGANIZER email harus sama dengan From address
    // Karena email dikirim dari EMAIL_USER (system account), pakai SENT-BY
    // supaya Outlook tahu siapa organizer aslinya tapi tetap trust sender
    `ORGANIZER;CN=${sanitizeCN(organizerName)};SENT-BY="mailto:${senderEmail}":mailto:${organizerEmail}`,
    ...attendeeLines,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "TRANSP:OPAQUE",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder: Meeting starts in 30 minutes",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // Apply line folding dan join dengan CRLF — wajib per RFC 5545
  return lines.map(foldLine).join("\r\n");
};

// ─── RSVP Buttons ───────────────────────────────────────────────────────────

const buildRSVPButtons = (meetingId, participantEmail) => {
  const base = process.env.API_URL || "http://localhost:5000";
  const encoded = encodeURIComponent(participantEmail);
  const accepted = `${base}/api/meeting/rsvp/${meetingId}?status=accepted&email=${encoded}`;
  const decline = `${base}/api/meeting/rsvp/${meetingId}?status=decline&email=${encoded}`;
  const tentative = `${base}/api/meeting/rsvp/${meetingId}?status=tentative&email=${encoded}`;

  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
    <tr>
      <td style="padding:0 0 12px 0;">
        <p style="margin:0 0 12px 0;font-size:14px;font-weight:600;color:#0F172A;">Will you attend this meeting?</p>
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:8px;">
              <a href="${accepted}"
                style="display:inline-block;padding:10px 20px;background:#4F46E5;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                &#10003; Yes, I'll attend
              </a>
            </td>
            <td style="padding-right:8px;">
              <a href="${decline}"
                style="display:inline-block;padding:10px 20px;background:#EF4444;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                &#10007; Can't attend
              </a>
            </td>
            <td>
              <a href="${tentative}"
                style="display:inline-block;padding:10px 20px;background:#F59E0B;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                ? Maybe
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
};

// ─── HTML Builder ────────────────────────────────────────────────────────────

const buildHTML = ({
  nama,
  meeting,
  room,
  organizer,
  totalParticipants, // ✅ diterima sebagai parameter
  participantEmail,
}) => `
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
          <h1 style="margin:0 0 6px 0;color:#0F172A;font-size:26px;font-weight:700;letter-spacing:-0.5px;line-height:1.2;">Meeting Invitation</h1>
          <p style="margin:0;color:#475569;font-size:15px;">You have been added as a participant</p>
        </td>
      </tr>

      <tr>
        <td style="padding:0 0 32px 0;">

          <p style="margin:0 0 6px 0;font-size:15px;color:#0F172A;">Hello, <strong style="color:#0F172A;">${nama}</strong></p>
          <p style="margin:0 0 32px 0;font-size:15px;color:#475569;line-height:1.6;">
            <strong style="color:#4F46E5;">${organizer.nama || organizer.username}</strong>
            has scheduled a meeting and you have been invited to participate.
          </p>

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
                <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">Start</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#1E293B;line-height:1.5;">${fmtDate(meeting.startTime)}</p>
              </td>
              <td width="4%"></td>
              <td width="48%" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:16px;vertical-align:top;">
                <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">End</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#1E293B;line-height:1.5;">${fmtDate(meeting.endTime)}</p>
              </td>
            </tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
            <tr>
              <td width="48%" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:16px;vertical-align:top;">
                <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">Duration</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#1E293B;">${duration(meeting.startTime, meeting.endTime)}</p>
              </td>
              <td width="4%"></td>
              <td width="48%" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:16px;vertical-align:top;">
                <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">Room</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#1E293B;">${room?.nama || "&mdash;"}</p>
              </td>
            </tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td width="48%" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:16px;vertical-align:top;">
                <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">Organizer</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#1E293B;">${organizer.nama || organizer.username}</p>
              </td>
              <td width="4%"></td>
              <td width="48%" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:16px;vertical-align:top;">
                <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:700;">Participants</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#1E293B;">${totalParticipants} people</p>
              </td>
            </tr>
          </table>

          ${buildRSVPButtons(meeting._id, participantEmail)}

          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#F8FAFC;border-left:4px solid #4F46E5;border-radius:0 8px 8px 0;padding:16px 20px;">
                <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">
                  <strong>Calendar invite attached</strong><br/>
                  Open the <strong>.ics</strong> file to add this meeting to Google Calendar, Outlook,
                  or Apple Calendar. A reminder will fire <strong>30 minutes</strong> before the meeting.
                </p>
              </td>
            </tr>
          </table>

        </td>
      </tr>

      <tr>
        <td style="border-top:1px solid #E2E8F0;padding:24px 0 0 0;text-align:center;">
          <p style="margin:0 0 4px 0;font-size:13px;color:#64748B;">
            Sent automatically by <strong style="color:#4F46E5;">Planify</strong>.
          </p>
          <p style="margin:0;font-size:12px;color:#94A3B8;">Please do not reply to this email.</p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>
`;

// ─── Main Export ─────────────────────────────────────────────────────────────

export const sendMeetingInvitation = async ({
  participants,
  organizer,
  meeting,
  room,
}) => {
  const icsContent = generateICS({
    title: meeting.title,
    description: meeting.description,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    location: room?.nama || "",
    organizerEmail: organizer.email,
    organizerName: organizer.nama || organizer.username,
    senderEmail: process.env.EMAIL_USER,
    meetingId: meeting._id,
    participants,
  });

  // ✅ Hitung totalParticipants di sini — tersedia untuk semua email
  const totalParticipants = participants.length;

  const safeTitle = meeting.title.replace(/\s+/g, "-").replace(/[^\w-]/g, "");

  const results = await Promise.allSettled(
    participants.map(({ email, nama }) =>
      transporter.sendMail({
        // ✅ From pakai nama organizer tapi alamat system email
        // Outlook membaca nama ini sebagai pengirim
        from: `"${organizer.nama || organizer.username} via Planify" <${process.env.EMAIL_USER}>`,
        to: email,
        // ✅ Reply-To ke organizer asli supaya balasan email ke orang yang benar
        replyTo: `"${organizer.nama || organizer.username}" <${organizer.email}>`,
        subject: `[Meeting Invitation] ${meeting.title}`,

        // ✅ Headers wajib agar Outlook/Exchange routing ke kalender
        headers: {
          "Content-Class": "urn:content-classes:calendarmessage",
          "X-MS-Exchange-Organization-CalendarBooking-Response": "True",
        },

        // ✅ alternatives = kunci utama agar Outlook tampilkan tombol Accept/Decline
        // Outlook hanya tampilkan tombol jika ICS ada di alternatives (multipart/alternative)
        alternatives: [
          {
            contentType: "text/calendar; method=REQUEST; charset=UTF-8",
            content: Buffer.from(icsContent, "utf-8"),
          },
        ],

        html: buildHTML({
          nama,
          meeting,
          room,
          organizer,
          totalParticipants,
          participantEmail: email,
        }),

        attachments: [
          {
            filename: `${safeTitle}-invite.ics`,
            content: Buffer.from(icsContent, "utf-8"),
            contentType: "application/ics",
            contentDisposition: "attachment",
          },
        ],
      }),
    ),
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
