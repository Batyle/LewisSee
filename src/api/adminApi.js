import { getAdminApiUrl } from "./apiRoot";

const tokenKey = "admin-session-token";

const request = async (path, options = {}) => {
  const baseUrl = getAdminApiUrl();
  const token = localStorage.getItem(tokenKey);
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("Could not reach the admin API. Check the deployment and its API service configuration.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.detail || "Unable to complete the request.");
  return body;
};

export async function signInAdmin(email, password) {
  const normalizedEmail = email.trim();
  const loginEmail = normalizedEmail.toLowerCase() === "admin"
    ? "admin@lewissee.local"
    : normalizedEmail;
  const response = await request("/login", {
    method: "POST",
    body: JSON.stringify({ email: loginEmail, password }),
  });
  localStorage.setItem(tokenKey, response.token);
  return response.admin;
}

export const getCurrentAdmin = () => request("/me").then((response) => response.admin || response);
export const clearAdminSession = () => localStorage.removeItem(tokenKey);
export const hasAdminSession = () => Boolean(localStorage.getItem(tokenKey));
export const listInstructors = () => request("/instructors");
export const approveInstructor = (uid) =>
  request(`/instructors/${encodeURIComponent(uid)}/approve`, { method: "POST" });
export const rejectInstructor = (uid, reason = "") =>
  request(`/instructors/${encodeURIComponent(uid)}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
export const suspendInstructor = (uid) =>
  request(`/instructors/${encodeURIComponent(uid)}/suspend`, { method: "POST" });
export const updateInstructor = (uid, instructor) =>
  request(`/instructors/${encodeURIComponent(uid)}/update`, {
    method: "PUT",
    body: JSON.stringify(instructor),
  });
