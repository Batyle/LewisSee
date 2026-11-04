const KEY = "attendance-theme";
export function getTheme() { return localStorage.getItem(KEY) || "system"; }
export function applyTheme(mode) { document.documentElement.dataset.theme = mode; localStorage.setItem(KEY, mode); }
export function watchSystemTheme(mode, callback) {
  const query = matchMedia("(prefers-color-scheme: dark)");
  const change = () => { if (mode === "system") callback(); };
  query.addEventListener("change", change); return () => query.removeEventListener("change", change);
}
