export function getApiRoot() {
  const adminUrl = import.meta.env.VITE_ADMIN_API_URL?.trim();
  if (adminUrl) return adminUrl.replace(/\/admin\/?$/, "").replace(/\/$/, "");
  if (!import.meta.env.DEV) return "/api";

  const localApiUrls = [
    [import.meta.env.VITE_ATTENDANCE_API_URL?.trim(), /\/attendance\/?$/],
    [import.meta.env.VITE_LIVENESS_API_URL?.trim(), /\/liveness\/?$/],
    [import.meta.env.VITE_API_URL?.trim(), /\/api\/?$/],
  ];
  for (const [url, suffix] of localApiUrls) {
    if (url) return url.replace(suffix, "").replace(/\/$/, "");
  }
  return "http://127.0.0.1:8000";
}

export function getAdminApiUrl() {
  const configured = import.meta.env.VITE_ADMIN_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return `${getApiRoot()}/admin`;
}

export function getInstructorApiUrl(path) {
  return `${getApiRoot()}${path}`;
}
