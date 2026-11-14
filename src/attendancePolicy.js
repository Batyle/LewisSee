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

/**
 * Present: at/before requiredTimeIn + grace
 * Late: after grace and at/before requiredTimeIn + lateThreshold
 * Absent: after lateThreshold (Late if lateThreshold is unset)
 */
export const determineAttendanceStatus = (
  currentScanTime,
  requiredTimeIn,
  gracePeriodMinutes = null,
  lateThresholdMinutes = null,
) => {
  const scan = parseClockToMinutes(currentScanTime);
  const required = parseClockToMinutes(requiredTimeIn);
  if (scan == null || required == null) {
    throw new RangeError("Current scan time and required time-in must be valid.");
  }

  const grace = Math.max(0, Number(gracePeriodMinutes) || 0);
  const presentUntil = required + grace;
  if (scan <= presentUntil) return "Present";

  if (lateThresholdMinutes == null || lateThresholdMinutes === "") return "Late";

  const lateUntil = required + Math.max(0, Number(lateThresholdMinutes) || 0);
  if (scan <= lateUntil) return "Late";
  return "Absent";
};

export const statusForRecord = (record, sessions = []) => {
  const session = sessions.find(
    (item) => item.section === record.section && item.date === record.date,
  );
  if (!session) return record.status || "Present";
  return determineAttendanceStatus(
    record.time,
    session.requiredTimeIn,
    session.gracePeriodMinutes,
    session.lateThresholdMinutes,
  );
};
