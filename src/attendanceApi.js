const LIVE_ATTENDANCE_API_URL = "https://lewissee.onrender.com/attendance";
const LIVE_LIVENESS_API_URL = "https://liveliness-server.vercel.app/liveness";

const isLocalUrl = (url) =>
  /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(String(url || "").trim());

const endpoint = () => {
  const attendanceUrl = import.meta.env.VITE_ATTENDANCE_API_URL?.trim();
  if (attendanceUrl && !isLocalUrl(attendanceUrl)) return attendanceUrl;

  const livenessUrl = import.meta.env.VITE_LIVENESS_API_URL?.trim();
  if (livenessUrl && !isLocalUrl(livenessUrl)) {
    return `${livenessUrl.replace(/\/liveness\/?$/, "").replace(/\/$/, "")}/attendance`;
  }

  return LIVE_ATTENDANCE_API_URL || `${LIVE_LIVENESS_API_URL.replace(/\/liveness\/?$/, "")}/attendance`;
};

const REQUEST_TIMEOUT_MS = 20000;

const request = async (method, body) => {
  const url = endpoint();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new Error("Attendance API request timed out. Check your connection and try again.");
    }
    clearTimeout(timeoutId);
    throw new Error("Could not reach the live attendance API. Check the Render service status.");
  }
  try {
    if (!response.ok) {
      let detail = `Attendance API returned ${response.status}.`;
      try {
        const payload = await response.json();
        detail = payload.detail || payload.message || detail;
      } catch {
        if (controller.signal.aborted) {
          throw new Error("Attendance API request timed out. Check your connection and try again.");
        }
      }
      throw new Error(detail);
    }
    try {
      return await response.json();
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error("Attendance API request timed out. Check your connection and try again.");
      }
      throw error;
    }
  } finally {
    clearTimeout(timeoutId);
  }
};

export const loadAttendanceStore = () => request("GET");
export const saveAttendanceStore = (store) => request("PUT", store);
