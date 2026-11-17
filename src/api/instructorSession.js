import { getInstructorApiUrl } from "./apiRoot";

export async function validateInstructorSession(token) {
  const response = await fetch(getInstructorApiUrl("/instructor-auth/session"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, message: body.message || "" };
}

export function releaseInstructorSession() {
  const token = localStorage.getItem("instructor-token");
  if (!token) return;

  void fetch(getInstructorApiUrl("/instructor-auth/logout"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).catch((cause) => {
    console.warn("Could not release the instructor session; it will expire automatically.", cause);
  });
}
