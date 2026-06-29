import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import MeetingParticipant from "../models/MeetingParticipant.js";
import User from "../models/User.js";

const PARTSTAT_MAP = {
  ACCEPTED: "accepted",
  DECLINED: "decline",
  TENTATIVE: "tentative",
};

const parseICSReply = (icsText) => {
  const unfolded = icsText.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
  const lines = unfolded.split(/\r\n|\n/);

  let attendeeEmail = null;
  let partstat = null;
  let meetingId = null;

  for (const line of lines) {
    if (line.startsWith("UID:")) {
      const match = line.match(/meeting-(.+?)@planify\.app/);
      if (match) meetingId = match[1].trim();
    }

    if (line.startsWith("ATTENDEE")) {
      const partstatMatch = line.match(/PARTSTAT=([A-Z-]+)/);
      const emailMatch = line.match(/mailto:(.+)$/i);

      if (partstatMatch) partstat = partstatMatch[1].trim();
      if (emailMatch) attendeeEmail = emailMatch[1].trim().toLowerCase();
    }
  }

  return { attendeeEmail, partstat, meetingId };
};

const processReply = async (parsed, io) => {
  try {
    const icsAttachment = parsed.attachments?.find(
      (a) =>
        a.contentType?.includes("calendar") || a.filename?.endsWith(".ics"),
    );

    if (!icsAttachment) return false;

    const icsText = icsAttachment.content.toString("utf8");

    if (!icsText.includes("METHOD:REPLY")) return false;

    const { attendeeEmail, partstat, meetingId } = parseICSReply(icsText);

    if (!attendeeEmail || !partstat || !meetingId) return false;

    const dbStatus = PARTSTAT_MAP[partstat];

    if (!dbStatus) return false;

    const user = await User.findOne({
      email: {
        $regex: new RegExp(`^${attendeeEmail}$`, "i"),
      },
    });

    if (!user) return false;

    const updated = await MeetingParticipant.findOneAndUpdate(
      {
        meetingId,
        userId: user._id,
      },
      {
        invitationStatus: dbStatus,
        responseAt: new Date(),
      },
      {
        new: true,
      },
    );

    if (!updated) return false;

    console.log(`✅ RSVP updated | ${attendeeEmail} → ${dbStatus}`);

    if (io) {
      io.emit("meeting:rsvp_updated", {
        meetingId,
        userId: user._id,
        status: dbStatus,
        responseAt: updated.responseAt,
      });
    }

    return true;
  } catch (err) {
    console.error("❌ Failed to process reply:", err.message);
    return false;
  }
};

const fetchAndProcessUnseen = async (client, io) => {
  try {
    const uids = await client.search({ seen: false }, { uid: true });

    if (!uids.length) return;

    for await (const msg of client.fetch(
      uids,
      {
        source: true,
      },
      {
        uid: true,
      },
    )) {
      try {
        const parsed = await simpleParser(msg.source);

        const success = await processReply(parsed, io);

        if (success) {
          await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"], {
            uid: true,
          });
        }
      } catch (err) {
        console.error("❌ Failed to read email:", err.message);
      }
    }
  } catch (err) {
    console.error("❌ Failed to fetch emails:", err.message);
  }
};

export const startReplyListener = async (io = null) => {
  const client = new ImapFlow({
    host: process.env.EMAIL_IMAP_HOST,
    port: Number(process.env.EMAIL_IMAP_PORT) || 993,
    secure: process.env.EMAIL_IMAP_SECURE !== "false",

    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },

    tls: {
      rejectUnauthorized: false,
    },

    logger: false,
  });

  client.on("error", (err) => {
    console.error("❌ IMAP error:", err.message);
  });

  try {
    await client.connect();

    console.log(`📬 IMAP connected (${process.env.EMAIL_USER})`);

    await client.mailboxOpen("INBOX");

    await fetchAndProcessUnseen(client, io);

    client.on("exists", async () => {
      console.log("📩 New email received");
      await fetchAndProcessUnseen(client, io);
    });

    await client.idle();
  } catch (err) {
    console.error("❌ IMAP connection failed:", err.message);

    setTimeout(() => {
      startReplyListener(io);
    }, 10000);
  }
};
