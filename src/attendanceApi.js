const endpoint = () => {
  const attendanceUrl = import.meta.env.VITE_ATTENDANCE_API_URL?.trim();
  if (attendanceUrl) return attendanceUrl;

  const livenessUrl = import.meta.env.VITE_LIVENESS_API_URL?.trim();
  if (livenessUrl) {
    return `${livenessUrl.replace(/\/liveness\/?$/, "").replace(/\/$/, "")}/attendance`;
  }

  return import.meta.env.DEV ? "http://127.0.0.1:8000/attendance" : "";
};

const REQUEST_TIMEOUT_MS = 20000;

const request = async (method, body) => {
  const url = endpoint();
  if (!url) {
    throw new Error(
      "Attendance API is not configured. Set VITE_LIVENESS_API_URL to the public Render /liveness URL in the deployment settings, then redeploy.",
    );
  }
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
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Attendance API request timed out. Check your connection and try again.");
    }
    clearTimeout(timeoutId);
    throw error;
  }
  try {
    if (!response.ok) {
      let detail = `Attendance API returned ${response.status}.`;
      try {
        detail = (await response.json()).detail || detail;
      } catch {
        if (controller.signal.aborted) {
          throw new Error("Attendance API request timed out. Check your connection and try again.");
        }
        // Use the status message if the server did not return JSON.
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
