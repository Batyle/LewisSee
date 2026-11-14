const MANILA_TZ = "Asia/Manila";

/** Current calendar date in Philippine Standard Time (Asia/Manila). */
export const todayManila = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

/** Current clock time as HH:MM in Philippine Standard Time. */
export const nowManilaTime = () =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: MANILA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());

/** Parse HH:MM, HH:MM:SS, or h:mm AM/PM into minutes since midnight. */
export const parseClockToMinutes = (value) => {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  const match24 = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);
  if (match24) {
    const hours = Number(match24[1]);
    const minutes = Number(match24[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }
  const match12 = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i.exec(text);
  if (!match12) return null;
  let hours = Number(match12[1]);
  const minutes = Number(match12[2]);
  const meridiem = match12[3].toUpperCase();
  if (hours < 1 || hours > 12 || minutes > 59) return null;
  if (meridiem === "AM") hours = hours === 12 ? 0 : hours;
  else hours = hours === 12 ? 12 : hours + 12;
  return hours * 60 + minutes;
};

export const formatClock12Hour = (value) => {
  const minutes = parseClockToMinutes(value);
  if (minutes == null) return String(value ?? "");

  const hour24 = Math.floor(minutes / 60);
  const hour12 = hour24 % 12 || 12;
  const minute = String(minutes % 60).padStart(2, "0");
  return `${hour12}:${minute} ${hour24 < 12 ? "AM" : "PM"}`;
};

const clockAtMinutes = (minutes) => {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
};

export const sessionTimeRanges = (session) => {
  const timeInStart = session.timeInStart || session.requiredTimeIn;
  const start = parseClockToMinutes(timeInStart);
  const isLegacy = !session.timeInEnd;
  const timeInEnd =
    session.timeInEnd ||
    (start == null
      ? ""
      : clockAtMinutes(start + Math.max(0, Number(session.gracePeriodMinutes) || 0)));
  const lateStart =
    session.lateStart ||
    (!isLegacy || parseClockToMinutes(timeInEnd) == null
      ? null
      : clockAtMinutes((parseClockToMinutes(timeInEnd) ?? start) + 1));
  const lateEnd =
    session.lateEnd ||
    (!isLegacy || start == null
      ? null
      : session.lateThresholdMinutes == null
        ? "23:59"
        : clockAtMinutes(start + Math.max(0, Number(session.lateThresholdMinutes) || 0)));
  return { timeInStart, timeInEnd, lateStart, lateEnd };
};

export const isAttendancePolicyReady = (session) => {
  if (!session) return false;

  const { timeInStart, timeInEnd, lateStart, lateEnd } = sessionTimeRanges(session);
  const start = parseClockToMinutes(timeInStart);
  const end = parseClockToMinutes(timeInEnd);
  if (start == null || end == null || end <= start) return false;
  if (!lateStart && !lateEnd) return true;
  if (!lateStart || !lateEnd) return false;

  const lateFrom = parseClockToMinutes(lateStart);
  const lateUntil = parseClockToMinutes(lateEnd);
  return lateFrom != null && lateUntil != null && lateFrom > end && lateUntil >= lateFrom;
};

export const determineAttendanceStatus = (
  currentScanTime,
  timeInStart,
  timeInEnd,
  lateStart = null,
  lateEnd = null,
) => {
  const scan = parseClockToMinutes(currentScanTime);
  const start = parseClockToMinutes(timeInStart);
  const end = parseClockToMinutes(timeInEnd);
  if (scan == null || start == null || end == null || end <= start) {
    throw new RangeError("Current scan time and time-in start/end must be valid.");
  }

  if (scan >= start && scan <= end) return "Present";

  if (lateStart == null || lateStart === "" || lateEnd == null || lateEnd === "") return "Absent";
  const lateFrom = parseClockToMinutes(lateStart);
  const lateUntil = parseClockToMinutes(lateEnd);
  if (lateFrom == null || lateUntil == null || lateFrom <= end || lateUntil < lateFrom) {
    throw new RangeError("Late period start/end must form a valid range after time-in.");
  }

  return scan >= lateFrom && scan <= lateUntil ? "Late" : "Absent";
};

export const statusForRecord = (record, sessions = []) => {
  const session = sessions.find(
    (item) => item.section === record.section && item.date === record.date,
  );
  if (!session) return record.status || "Present";
  const ranges = sessionTimeRanges(session);
  return determineAttendanceStatus(
    record.time,
    ranges.timeInStart,
    ranges.timeInEnd,
    ranges.lateStart,
    ranges.lateEnd,
  );
};
