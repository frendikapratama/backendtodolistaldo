import cron from "node-cron";
import Meeting from "../models/Meeting.js";
import MeetingParticipant from "../models/MeetingParticipant.js";
import User from "../models/User.js";
import {
  sendMeetingInvitation,
  sendMeetingCancellationEmail,
} from "../helpers/meetingEmailService.js";
import {
  sendMeetingWhatsAppNotification,
  sendMeetingCancellationWhatsApp,
} from "../helpers/meetingWhatsAppService.js";

const TWO_HOURS_IN_MS = 2 * 60 * 60 * 1000;

// Pesan reminder khusus organizer
const ORGANIZER_REMINDER_TEXT =
  "Meeting akan segera dimulai dalam 2 jam. Jika tidak jadi, mohon segera konfirmasi kepada HRD.";

// Pesan reminder biasa (untuk participant & divisi target)
const GENERAL_REMINDER_TEXT = "Meeting akan segera dimulai dalam 2 jam.";

export const startMeetingReminderJob = () => {
  cron.schedule("*/1 * * * *", async () => {
    try {
      const now = new Date();
      const targetStart = new Date(now.getTime() + TWO_HOURS_IN_MS);
      const targetStartMin = new Date(targetStart.getTime() - 60 * 1000);
      const targetStartMax = new Date(targetStart.getTime() + 60 * 1000);

      // Hanya meeting yang masih berstatus "scheduled" dan belum dikirim reminder
      const meetings = await Meeting.find({
        status: "scheduled",
        startTime: { $gte: targetStartMin, $lte: targetStartMax },
        $or: [{ reminderSentAt: null }, { reminderSentAt: { $exists: false } }],
      })
        .populate("roomId", "nama lokasi")
        .populate("organizerId", "nama username email noHp")
        .lean();

      for (const meeting of meetings) {
        // Lock terlebih dahulu untuk mencegah double-send (race condition)
        const lockedMeeting = await Meeting.findOneAndUpdate(
          {
            _id: meeting._id,
            $or: [
              { reminderSentAt: null },
              { reminderSentAt: { $exists: false } },
            ],
          },
          { $set: { reminderSentAt: now } },
          { new: true },
        );

        if (!lockedMeeting) {
          // Sudah ada proses lain yang lock meeting ini, skip
          continue;
        }

        const organizer = meeting.organizerId;
        const organizerIdStr = organizer?._id?.toString();

        // Ambil semua participant meeting (selain organizer jika organizer sudah
        // didaftarkan sebagai participant — hindari duplikasi)
        const participants = await MeetingParticipant.find({
          meetingId: meeting._id,
        })
          .populate("userId", "nama username email noHp")
          .lean();

        const participantUsers = participants
          .map((p) => p.userId)
          .filter(Boolean)
          // Hilangkan organizer dari list participant agar tidak double notif
          .filter((u) => u._id?.toString() !== organizerIdStr);

        // Ambil user dari targetDivisions & targetUserIds yang bukan participant
        // dan bukan organizer
        const targetDivisions = [/^it$/i];
        const targetUserIds = [
          "6a20de5c50ad9c30e06b9641", // hadi
          "6a1f97c04cf5cd6b3c82a2f4", // mia
        ];

        const allExcludedIds = [
          ...participantUsers.map((u) => u._id),
          // Juga exclude organizer agar tidak masuk ke grup "non-participant"
          ...(organizerIdStr ? [organizerIdStr] : []),
        ];

        const targetUsers = await User.find({
          $or: [
            { divisi: { $in: targetDivisions } },
            { _id: { $in: targetUserIds } },
          ],
          _id: { $nin: allExcludedIds },
        })
          .select("nama username email noHp")
          .lean();

        // ── Kirim notif khusus ke ORGANIZER
        if (organizer?.email || organizer?.noHp) {
          const organizerPayload = {
            participants: [
              {
                email: organizer.email,
                nama: organizer.nama || organizer.username,
                isParticipant: true, // organizer diperlakukan sebagai participant
              },
            ],
            organizer,
            meeting,
            room: meeting.roomId,
            isReminder: true,
            reminderText: ORGANIZER_REMINDER_TEXT,
          };

          const organizerWaPayload = {
            participants: [
              {
                noHp: organizer.noHp,
                nama: organizer.nama || organizer.username,
                email: organizer.email,
                isParticipant: true,
              },
            ],
            organizer,
            meeting,
            room: meeting.roomId,
            isReminder: true,
            reminderText: ORGANIZER_REMINDER_TEXT,
          };

          await Promise.allSettled([
            organizer.email
              ? sendMeetingInvitation(organizerPayload)
              : Promise.resolve(),
            organizer.noHp
              ? sendMeetingWhatsAppNotification(organizerWaPayload)
              : Promise.resolve(),
          ]);
        }

        // ── Kirim notif biasa ke PARTICIPANT & TARGET DIVISIONS/USERS
        const generalNotifyUsers = [
          ...participantUsers.map((u) => ({ ...u, isParticipant: true })),
          ...targetUsers.map((u) => ({ ...u, isParticipant: false })),
        ];

        if (generalNotifyUsers.length > 0) {
          await Promise.allSettled([
            sendMeetingInvitation({
              participants: generalNotifyUsers.map((u) => ({
                email: u.email,
                nama: u.nama || u.username,
                isParticipant: u.isParticipant,
              })),
              organizer,
              meeting,
              room: meeting.roomId,
              isReminder: true,
              reminderText: GENERAL_REMINDER_TEXT,
            }),
            sendMeetingWhatsAppNotification({
              participants: generalNotifyUsers.map((u) => ({
                noHp: u.noHp,
                nama: u.nama || u.username,
                email: u.email,
                isParticipant: u.isParticipant,
              })),
              organizer,
              meeting,
              room: meeting.roomId,
              isReminder: true,
              reminderText: GENERAL_REMINDER_TEXT,
            }),
          ]);
        }

        console.log(
          `[ReminderJob] Reminder sent for meeting "${meeting.title}" (${meeting._id})`,
        );
      }
    } catch (error) {
      console.error("Error in meeting reminder job:", error);
    }
  });

  console.log("Meeting reminder job scheduled (runs every minute)");
};
