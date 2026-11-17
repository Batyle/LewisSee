const buildEnv = import.meta.env || {};
const runtimeEnv = typeof process === "undefined" ? {} : process.env;
const getSetting = (name) => buildEnv[name] || runtimeEnv[name] || "";

export const ADMIN_INSTRUCTOR_EMAILJS = Object.freeze({
  serviceId: getSetting("VITE_ADMIN_INSTRUCTOR_EMAILJS_SERVICE_ID"),
  templateId: getSetting("VITE_ADMIN_INSTRUCTOR_EMAILJS_TEMPLATE_ID"),
  publicKey: getSetting("VITE_ADMIN_INSTRUCTOR_EMAILJS_PUBLIC_KEY"),
});

export const INSTRUCTOR_REQUEST_EMAILJS = Object.freeze({
  serviceId: getSetting("VITE_INSTRUCTOR_REQUEST_EMAILJS_SERVICE_ID"),
  templateId: getSetting("VITE_INSTRUCTOR_REQUEST_EMAILJS_TEMPLATE_ID"),
  publicKey: getSetting("VITE_INSTRUCTOR_REQUEST_EMAILJS_PUBLIC_KEY"),
});

export const STUDENT_ATTENDANCE_EMAILJS = Object.freeze({
  serviceId: getSetting("VITE_EMAILJS_SERVICE_ID"),
  templateId: getSetting("VITE_EMAILJS_TEMPLATE_ID"),
  publicKey: getSetting("VITE_EMAILJS_PUBLIC_KEY"),
});

export function requireEmailJsSettings(settings, label) {
  if (!settings.serviceId || !settings.templateId || !settings.publicKey) {
    throw new Error(`${label} EmailJS settings are missing. Configure the VITE_EMAILJS_* variables in Vercel and redeploy.`);
  }
}
