import emailjs from "@emailjs/browser";
import { sendWithRetry } from "./emailRetry.js";
import { ADMIN_INSTRUCTOR_EMAILJS } from "./emailConfig.js";

function buildDecisionParams(instructor, decision) {
  const approved = decision === "approved";
  const suspended = decision === "suspended";
  const recipient = instructor.email.trim();
  const replyTo = import.meta.env.VITE_ADMIN_NOTIFICATION_REPLY_TO?.trim();
  const message = approved
    ? `Your LewisSee instructor access request was approved. Sign in at https://lewis-see.vercel.app using ${recipient}. Your instructor ID is ${instructor.instructorId || "being assigned"}.`
    : suspended
      ? "Your LewisSee instructor access was suspended. Contact an administrator if you believe this is a mistake."
      : "Your LewisSee instructor access request was not approved. Contact an administrator if you have questions.";

  return {
    to_email: recipient,
    recipient_email: recipient,
    instructor_email: recipient,
    to_name: instructor.name,
    email: recipient,
    subject: approved
      ? "LewisSee instructor access approved"
      : suspended
        ? "LewisSee instructor access update"
        : "LewisSee instructor access request update",
    ...(replyTo ? { reply_to: replyTo } : {}),
    instructor_name: instructor.name,
    decision,
    status: approved ? "active" : suspended ? "suspended" : "rejected",
    instructor_id: instructor.instructorId || "",
    password: "",
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

export async function sendInstructorUpdateEmail(instructor, changedFields) {
  if (!instructor.email?.trim()) {
    throw new Error("The instructor account has no email address.");
  }
  const recipient = instructor.email.trim();
  const replyTo = import.meta.env.VITE_ADMIN_NOTIFICATION_REPLY_TO?.trim();

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
        subject: "LewisSee instructor account update",
        ...(replyTo ? { reply_to: replyTo } : {}),
        instructor_name: instructor.name,
        instructor_id: instructor.instructorId || "",
        password: "",
        decision: "updated",
        status: instructor.status,
        reason: "",
        changed_fields: changedFields.join(", "),
        message: `An administrator updated your LewisSee instructor account (${changedFields.join(", ")}). If you did not expect this change, contact a LewisSee administrator.`,
      },
      { publicKey: ADMIN_INSTRUCTOR_EMAILJS.publicKey },
    ),
  );
}
