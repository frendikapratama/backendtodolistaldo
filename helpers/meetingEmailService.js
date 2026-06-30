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
      `ATTENDEE;CUTYPE=INDIVIDUAL;CN=${sanitizeCN(p.nama || p.username)};RSVP=TRUE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:mailto:${p.email}`,
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
    `CREATED:${fmt(new Date())}Z`,
    `DTSTART;TZID=Asia/Jakarta:${fmtLocal(startTime)}`,
    `DTEND;TZID=Asia/Jakarta:${fmtLocal(endTime)}`,
    `SUMMARY:${escapeICS(title)}`,
    `DESCRIPTION:${escapeICS(description)}`,
    `LOCATION:${escapeICS(location)}`,
    // Outlook WAJIB: mailto ORGANIZER harus sama persis dengan alamat From (senderEmail)
    `ORGANIZER;CN=${sanitizeCN(organizerName)}:mailto:${senderEmail}`,
    ...attendeeLines,
    "CLASS:PUBLIC",
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "TRANSP:OPAQUE",
    // Properti Microsoft — membantu Outlook/OWA mengenali sebagai appointment
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
  const base = process.env.VITE_API_URL || "https://planify.itvault.cloud/api";
  const encoded = encodeURIComponent(participantEmail);

  const accepted = `${base}/api/meeting/rsvp/${meetingId}?status=accepted&email=${encoded}`;
  const tentative = `${base}/api/meeting/rsvp/${meetingId}?status=tentative&email=${encoded}`;
  const decline = `${base}/api/meeting/rsvp/${meetingId}?status=decline&email=${encoded}`;

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
<tr>
<td>

<p style="
  margin:0 0 14px;
  font-size:15px;
  font-weight:600;
  color:#0F172A;
  ">
  Will you attend this meeting?
</p>

<table role="presentation" cellpadding="0" cellspacing="0">
<tr>

<td style="padding-right:10px;">
<a href="${accepted}"
style="
background:#2563EB;
color:#ffffff;
text-decoration:none;
padding:12px 24px;
font-size:14px;
font-weight:600;
border-radius:22px;
display:inline-block;
font-family:Arial,sans-serif;
">
Accept
</a>
</td>

<td style="padding-right:10px;">
<a href="${tentative}"
style="
background:#F3F4F6;
color:#374151;
text-decoration:none;
padding:12px 24px;
font-size:14px;
font-weight:600;
border-radius:22px;
display:inline-block;
border:1px solid #D1D5DB;
font-family:Arial,sans-serif;
">
Tentative
</a>
</td>

<td>
<a href="${decline}"
style="
background:#ffffff;
color:#DC2626;
text-decoration:none;
padding:12px 24px;
font-size:14px;
font-weight:600;
border-radius:22px;
display:inline-block;
border:1px solid #FCA5A5;
font-family:Arial,sans-serif;
">
Decline
</a>
</td>

</tr>
</table>

</td>
</tr>
</table>
`;
};

// ─── Plain Text Builder

const buildPlainText = ({ nama, meeting, room, organizer }) =>
  [
    `Meeting Invitation: ${meeting.title}`,
    "",
    `Hello ${nama},`,
    `${organizer.nama || organizer.username} has invited you to a meeting.`,
    "",
    `When: ${fmtDate(meeting.startTime)} – ${fmtDate(meeting.endTime)}`,
    `Duration: ${duration(meeting.startTime, meeting.endTime)}`,
    `Location: ${room?.nama || "—"}`,
    meeting.description ? `Details: ${meeting.description}` : null,
    "",
    "Open this email in Outlook and use Accept/Decline to add it to your calendar.",
  ]
    .filter(Boolean)
    .join("\r\n");

// ─── HTML Builder

const buildHTML = ({
  nama,
  meeting,
  room,
  organizer,
  totalParticipants,
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

// ─── Main Export

export const sendMeetingInvitation = async ({
  participants,
  organizer,
  meeting,
  room,
}) => {
  const senderEmail = process.env.EMAIL_USER;
  const totalParticipants = participants.length;
  const safeTitle = meeting.title.replace(/\s+/g, "-").replace(/[^\w-]/g, "");

  const results = await Promise.allSettled(
    participants.map(({ email, nama }) => {
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
      });

      const htmlContent = buildHTML({
        nama,
        meeting,
        room,
        organizer,
        totalParticipants,
        participantEmail: email,
      });

      return transporter.sendMail({
        // from: `"${organizer.nama || organizer.username} via Planify" <${senderEmail}>`,
        from: `"Planify" <${process.env.EMAIL_USER}>`,
        to: email,
        replyTo: `"${organizer.nama || organizer.username}" <${organizer.email}>`,
        subject: `[Meeting Invitation] ${meeting.title}`,

        headers: {
          "Content-Class": "urn:content-classes:calendarmessage",
          "X-MS-OLK-FORCEINSPECTOROPEN": "TRUE",
        },

        text: buildPlainText({ nama, meeting, room, organizer }),
        html: htmlContent,

        // Microsoft/Outlook: ICS harus MIME part TERPISAH (sibling), BUKAN di dalam
        // multipart/alternative. Nodemailer icalEvent/alternatives salah struktur untuk OWA.
        // Inline + text/calendar; method=REQUEST → tombol Accept/Decline di Outlook Web.
        // attachments: [
        //   {
        //     filename: `${safeTitle}-invite.ics`,
        //     content: icsContent,
        //     contentType: "text/calendar; charset=UTF-8; method=REQUEST",
        //     contentDisposition: "inline",
        //     contentTransferEncoding: "7bit",
        //     headers: {
        //       "Content-Class": "urn:content-classes:calendarmessage",
        //     },
        //   },
        // ],
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
