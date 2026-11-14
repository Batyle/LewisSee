// Live Vercel site: https://lewis-see.vercel.app — admin/instructor APIs are same-origin /api/*
export function getApiRoot() {
  return "/api";
}

export function getAdminApiUrl() {
  return "/api/admin";
}

export function getInstructorApiUrl(path) {
  return `${getApiRoot()}${path}`;
}
