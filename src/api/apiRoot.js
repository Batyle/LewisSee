export function getApiRoot() {
  const configuredUrls = [
    [import.meta.env.VITE_ADMIN_API_URL?.trim(), /\/admin\/?$/],
    [import.meta.env.VITE_ATTENDANCE_API_URL?.trim(), /\/attendance\/?$/],
    [import.meta.env.VITE_LIVENESS_API_URL?.trim(), /\/liveness\/?$/],
    [import.meta.env.VITE_API_URL?.trim(), /\/api\/?$/],
  ];

  for (const [url, suffix] of configuredUrls) {
    if (url) return url.replace(suffix, "").replace(/\/$/, "");
  }

  if (import.meta.env.DEV) return "http://127.0.0.1:8000";
  throw new Error("The attendance API is not configured for this deployment.");
}

export function getAdminApiUrl() {
  return `${getApiRoot()}/admin`;
}

export function getInstructorApiUrl(path) {
  return `${getApiRoot()}${path}`;
}
