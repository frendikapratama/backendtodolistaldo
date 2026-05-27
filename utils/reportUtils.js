import dayjs from "dayjs";

export const calculateDuration = (start, end) => {
  if (!start || !end) return null;

  return dayjs(end).diff(dayjs(start), "day");
};

export const getCompletionStatus = (dueDate, finishDate) => {
  if (!dueDate || !finishDate) return "UNFINISHED";

  const diff = dayjs(finishDate).diff(dayjs(dueDate), "day");

  if (diff < 0) return "EARLY";
  if (diff === 0) return "ONTIME";

  return "LATE";
};

export const getCompletionStatusFromNote = (note) => {
  if (!note) return "UNFINISHED";
  const lower = String(note).toLowerCase().trim();

  // Exact matches for database values: "Completed - Early", "Completed - On Time", "Completed - Overdue"
  if (lower.includes("overdue") || lower === "late") return "LATE";
  if (lower.includes("on time") || lower === "ontime" || lower === "on-time") return "ONTIME";
  if (lower.includes("early")) return "EARLY";

  // "Uncomplete" and "Planning" = not yet finished
  return "UNFINISHED";
};