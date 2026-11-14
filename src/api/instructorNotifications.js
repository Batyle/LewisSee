import emailjs from "@emailjs/browser";

// Authoritative admin → instructor EmailJS credentials (do not let stale Vercel env override these).
export const ADMIN_EMAILJS_SERVICE_ID = "service_42lrlwk";
export const ADMIN_EMAILJS_TEMPLATE_ID = "template_cgf0ftr";
const ADMIN_EMAILJS_PUBLIC_KEY = "_OxeAtIVSYaPNqVhG";

function buildDecisionParams(instructor, decision, password = "") {
  const approved = decision === "approved";
  const suspended = decision === "suspended";
  const recipient = instructor.email.trim();
  const replyTo = import.meta.env.VITE_ADMIN_NOTIFICATION_REPLY_TO?.trim() || recipient;
  const message = approved
    ? `Your instructor access request has been approved. Your instructor ID is ${instructor.instructorId || "being assigned"}. You can now sign in to LewisSee.`
    : suspended
      ? "Your LewisSee instructor account has been suspended. Please contact an administrator for assistance."
      : "Your instructor access request has been denied.";

  return {
    to_email: recipient,
    recipient_email: recipient,
    to_name: instructor.name,
    email: recipient,
    reply_to: replyTo,
    instructor_name: instructor.name,
    decision,
    status: approved ? "active" : suspended ? "suspended" : "rejected",
    instructor_id: instructor.instructorId || "",
    password: password || (approved ? "Use the password you set during registration" : ""),
    message,
    reason: instructor.rejectionReason || "",
  };
}

export async function sendInstructorDecisionEmail(instructor, decision) {
  if (!instructor.email?.trim()) {
    throw new Error("The instructor account has no email address.");
  }

  return emailjs.send(
    ADMIN_EMAILJS_SERVICE_ID,
    ADMIN_EMAILJS_TEMPLATE_ID,
    buildDecisionParams(instructor, decision),
    { publicKey: ADMIN_EMAILJS_PUBLIC_KEY },
  );
}

export async function sendInstructorUpdateEmail(instructor, changedFields, password = "") {
  if (!instructor.email?.trim()) {
    throw new Error("The instructor account has no email address.");
  }
  const recipient = instructor.email.trim();
  const replyTo = import.meta.env.VITE_ADMIN_NOTIFICATION_REPLY_TO?.trim() || recipient;

  return emailjs.send(
    ADMIN_EMAILJS_SERVICE_ID,
    ADMIN_EMAILJS_TEMPLATE_ID,
    {
      to_email: recipient,
      recipient_email: recipient,
      to_name: instructor.name,
      email: recipient,
      reply_to: replyTo,
      instructor_name: instructor.name,
      instructor_id: instructor.instructorId || "",
      password: password || "Unchanged — use your existing password",
      decision: "updated",
      status: instructor.status,
      reason: "",
      changed_fields: changedFields.join(", "),
      message: `An administrator updated your instructor account: ${changedFields.join(", ")}. Contact your administrator if you did not expect this change.`,
    },
    { publicKey: ADMIN_EMAILJS_PUBLIC_KEY },
  );
}
