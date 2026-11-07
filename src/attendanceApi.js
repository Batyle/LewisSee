const endpoint = () =>
  import.meta.env.VITE_ATTENDANCE_API_URL?.trim() ||
  (import.meta.env.DEV ? "http://127.0.0.1:8000/attendance" : "");

const request = async (method, body) => {
  const url = endpoint();
  if (!url) throw new Error("Attendance API is not configured for this deployment.");
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    let detail = `Attendance API returned ${response.status}.`;
    try {
      detail = (await response.json()).detail || detail;
    } catch {
      // Use the status message if the server did not return JSON.
    }
    throw new Error(detail);
  }
  return response.json();
};

export const loadAttendanceStore = () => request("GET");
export const saveAttendanceStore = (store) => request("PUT", store);
