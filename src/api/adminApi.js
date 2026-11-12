const tokenKey = "admin-session-token";
const testToken = "local-test-admin";
const testAdmin = { id: 0, name: "Administrator", email: "admin", role: "admin" };

const endpoint = () => {
  const configured = import.meta.env.VITE_ADMIN_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  // Live MySQL admin auth is served by the liveness API under /admin.
  return "http://127.0.0.1:8000/admin";
};

const request = async (path, options = {}) => {
  const baseUrl = endpoint();
  if (!baseUrl) throw new Error("Admin API is not configured for this deployment.");
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
    throw new Error(
      "Failed to reach the MySQL admin API. Start liveness-server (port 8000) and confirm VITE_ADMIN_API_URL.",
    );
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.detail || "Unable to complete the request.");
  return body;
};

export async function signInAdmin(email, password) {
  if (email === "admin" && password === "admin123") {
    localStorage.setItem(tokenKey, testToken);
    return testAdmin;
  }
  const response = await request("/login", { method: "POST", body: JSON.stringify({ email, password }) });
  localStorage.setItem(tokenKey, response.token);
  return response.admin;
}

export const getCurrentAdmin = () => localStorage.getItem(tokenKey) === testToken
  ? Promise.resolve(testAdmin)
  : request("/me").then((response) => response.admin || response);
export const clearAdminSession = () => localStorage.removeItem(tokenKey);
export const hasAdminSession = () => Boolean(localStorage.getItem(tokenKey));
