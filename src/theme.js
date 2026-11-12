const KEY = "attendance-theme";

function systemPrefersDark() {
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

export function getTheme() {
  const saved = localStorage.getItem(KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}

export function resolveTheme(mode = getTheme()) {
  if (mode === "light" || mode === "dark") return mode;
  return systemPrefersDark() ? "dark" : "light";
}

export function applyTheme(mode = getTheme()) {
  const preference = mode === "light" || mode === "dark" || mode === "system" ? mode : "system";
  localStorage.setItem(KEY, preference);
  document.documentElement.dataset.theme = resolveTheme(preference);
}

export function watchSystemTheme(mode, callback) {
  const query = matchMedia("(prefers-color-scheme: dark)");
  const change = () => {
    if (mode === "system") callback();
  };
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}

if (typeof document !== "undefined") {
  applyTheme(getTheme());
}
