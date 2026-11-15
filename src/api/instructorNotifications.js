import emailjs from "@emailjs/browser";
import { sendWithRetry } from "./emailRetry.js";
import { ADMIN_INSTRUCTOR_EMAILJS } from "./emailConfig.js";

function buildDecisionParams(instructor, decision, password = "") {
  const approved = decision === "approved";
  const suspended = decision === "suspended";
  const recipient = instructor.email.trim();
  const replyTo = import.meta.env.VITE_ADMIN_NOTIFICATION_REPLY_TO?.trim() || recipient;
  const message = approved
    ? `Your instructor access request has been approved. Your instructor ID is ${instructor.instructorId || "being assigned"}. Sign in using ${recipient} at LewisSee.`
    : suspended
      ? "Your LewisSee instructor account has been suspended. Please contact an administrator for assistance."
      : "Your instructor access request has been denied.";

  return {
    to_email: recipient,
    recipient_email: recipient,
    instructor_email: recipient,
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

  return sendWithRetry(
    () => emailjs.send(
      ADMIN_INSTRUCTOR_EMAILJS.serviceId,
      ADMIN_INSTRUCTOR_EMAILJS.templateId,
      buildDecisionParams(instructor, decision),
      { publicKey: ADMIN_INSTRUCTOR_EMAILJS.publicKey },
    ),
  );
}

export async function sendInstructorUpdateEmail(instructor, changedFields, password = "") {
  if (!instructor.email?.trim()) {
    throw new Error("The instructor account has no email address.");
  }
  const recipient = instructor.email.trim();
  const replyTo = import.meta.env.VITE_ADMIN_NOTIFICATION_REPLY_TO?.trim() || recipient;

  return sendWithRetry(
    () => emailjs.send(
      ADMIN_INSTRUCTOR_EMAILJS.serviceId,
      ADMIN_INSTRUCTOR_EMAILJS.templateId,
      {
        to_email: recipient,
        recipient_email: recipient,
        instructor_email: recipient,
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
      { publicKey: ADMIN_INSTRUCTOR_EMAILJS.publicKey },
    ),
  );
}
