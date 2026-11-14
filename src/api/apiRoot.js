const LIVE_API_ROOT = "https://lewissee.onrender.com";

const isLocalUrl = (url) =>
  /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(String(url || "").trim());

function firstLiveUrl(candidates) {
  for (const [url, suffix] of candidates) {
    if (!url || isLocalUrl(url)) continue;
    return url.replace(suffix, "").replace(/\/$/, "") || LIVE_API_ROOT;
  }
  return LIVE_API_ROOT;
}

export function getApiRoot() {
  // Same-origin Vercel serverless routes for admin/instructor on the live site.
  if (!import.meta.env.DEV) return "/api";

  const adminUrl = import.meta.env.VITE_ADMIN_API_URL?.trim();
  if (adminUrl && !isLocalUrl(adminUrl)) {
    return adminUrl.replace(/\/admin\/?$/, "").replace(/\/$/, "") || LIVE_API_ROOT;
  }

  return firstLiveUrl([
    [import.meta.env.VITE_ATTENDANCE_API_URL?.trim(), /\/attendance\/?$/],
    [import.meta.env.VITE_LIVENESS_API_URL?.trim(), /\/liveness\/?$/],
    [import.meta.env.VITE_API_URL?.trim(), /\/api\/?$/],
  ]);
}

export function getAdminApiUrl() {
  if (!import.meta.env.DEV) return "/api/admin";

  const configured = import.meta.env.VITE_ADMIN_API_URL?.trim();
  if (configured && !isLocalUrl(configured)) return configured.replace(/\/$/, "");
  return `${getApiRoot()}/admin`;
}

export function getInstructorApiUrl(path) {
  return `${getApiRoot()}${path}`;
}
