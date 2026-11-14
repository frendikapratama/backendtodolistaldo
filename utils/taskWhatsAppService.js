/**
 * WA message templates untuk task/subtask notifications
 */
import { sendWhatsAppMessage } from "./whatsapp.js";
import dayjs from "dayjs";

function formatDate(date) {
  if (!date) return "-";
  return dayjs(date).format("DD MMM YYYY");
}

/**
 * Kirim WA notifikasi Done-In Review ke reviewer (non-member / non-PIC)
 */
export async function sendDoneInReviewWA({
  noHp,
  taskName,
  subtaskName = null,
  projectName,
  workspaceName,
  changerName,
}) {
  const itemLabel = subtaskName
    ? `Subtask: *${subtaskName}*\n   Task: ${taskName}`
    : `Task: *${taskName}*`;

  const message =
    `✅ *[Planify] Item Needs Review*\n\n` +
    `${itemLabel}\n` +
    `📁 Project: ${projectName}\n` +
    `🏢 Workspace: ${workspaceName}\n` +
    `👤 Marked Done-In Review by: *${changerName}*\n\n` +
    `Mohon segera lakukan review & approval di aplikasi Planify.`;

  return sendWhatsAppMessage(noHp, message);
}

/**
 * Kirim WA reminder task/subtask mendekati due date
 */
export async function sendDueSoonWA({
  noHp,
  taskName,
  subtaskName = null,
  projectName,
  workspaceName,
  dueDate,
  status,
  daysRemaining,
}) {
  const urgency =
    daysRemaining === 1
      ? "⚠️ BESOK!"
      : daysRemaining === 7
        ? "dalam 1 minggu"
        : `dalam *${daysRemaining} hari*`;

  const itemLabel = subtaskName
    ? `Subtask: *${subtaskName}*\n   Task: ${taskName}`
    : `Task: *${taskName}*`;

  const message =
    `⏰ *[Planify] Reminder Due Date*\n\n` +
    `${itemLabel}\n` +
    `📁 Project: ${projectName}\n` +
    `🏢 Workspace: ${workspaceName}\n` +
    `📅 Due Date: ${formatDate(dueDate)} (${urgency})\n` +
    `📌 Status: ${status}\n\n` +
    `Segera selesaikan sebelum deadline!`;

  return sendWhatsAppMessage(noHp, message);
}

/**
 * Kirim WA notifikasi task/subtask sudah overdue
 */
export async function sendOverdueWA({
  noHp,
  taskName,
  subtaskName = null,
  projectName,
  workspaceName,
  dueDate,
  status,
  daysOverdue,
}) {
  const itemLabel = subtaskName
    ? `Subtask: *${subtaskName}*\n   Task: ${taskName}`
    : `Task: *${taskName}*`;

  const message =
    `🚨 *[Planify] OVERDUE ALERT!*\n\n` +
    `${itemLabel}\n` +
    `📁 Project: ${projectName}\n` +
    `🏢 Workspace: ${workspaceName}\n` +
    `📅 Deadline: ${formatDate(dueDate)}\n` +
    `🔴 Terlambat: *${daysOverdue} hari*\n` +
    `📌 Status: ${status}\n\n` +
    `⚠️ Harap segera selesaikan task ini!`;

  return sendWhatsAppMessage(noHp, message);
}

