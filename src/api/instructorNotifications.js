import emailjs from "@emailjs/browser";

const ADMIN_EMAILJS_SERVICE_ID = import.meta.env.VITE_ADMIN_EMAILJS_SERVICE_ID?.trim() || "service_42lrlwk";
const ADMIN_EMAILJS_TEMPLATE_ID = import.meta.env.VITE_ADMIN_EMAILJS_TEMPLATE_ID?.trim() || "template_cgf0ftr";
const ADMIN_EMAILJS_PUBLIC_KEY = import.meta.env.VITE_ADMIN_EMAILJS_PUBLIC_KEY?.trim() || "_OxeAtIVSYaPNqVhG";

export async function sendInstructorDecisionEmail(instructor, decision) {
  const replyTo = import.meta.env.VITE_ADMIN_NOTIFICATION_REPLY_TO?.trim();

  if (!instructor.email?.trim()) {
    throw new Error("The instructor account has no email address.");
  }

  const approved = decision === "approved";
  const message = approved
    ? `Your instructor access request has been approved. Your instructor ID is ${instructor.instructorId || "being assigned"}. You can now sign in to LewisSee.`
    : "Your instructor access request has been denied.";
  const recipient = instructor.email.trim();

  return emailjs.send(
    ADMIN_EMAILJS_SERVICE_ID,
    ADMIN_EMAILJS_TEMPLATE_ID,
    {
      to_email: recipient,
      recipient_email: recipient,
      to_name: instructor.name,
      email: recipient,
      reply_to: replyTo || recipient,
      instructor_name: instructor.name,
      decision,
      status: approved ? "active" : "rejected",
      instructor_id: instructor.instructorId || "",
      message,
      reason: instructor.rejectionReason || "",
    },
    { publicKey: ADMIN_EMAILJS_PUBLIC_KEY },
  );
}

export async function sendInstructorUpdateEmail(instructor, changedFields) {
  const templateId = import.meta.env.VITE_INSTRUCTOR_UPDATE_TEMPLATE_ID?.trim() || ADMIN_EMAILJS_TEMPLATE_ID;
  const replyTo = import.meta.env.VITE_ADMIN_NOTIFICATION_REPLY_TO?.trim();
  if (!instructor.email?.trim()) {
    throw new Error("The instructor account has no email address.");
  }
  const recipient = instructor.email.trim();

  return emailjs.send(
    ADMIN_EMAILJS_SERVICE_ID,
    templateId,
    {
      to_email: recipient,
      recipient_email: recipient,
      to_name: instructor.name,
      email: recipient,
      reply_to: replyTo || recipient,
      instructor_name: instructor.name,
      instructor_id: instructor.instructorId || "",
      decision: "updated",
      status: instructor.status,
      reason: "",
      changed_fields: changedFields.join(", "),
      message: `An administrator updated your instructor account: ${changedFields.join(", ")}. Contact your administrator if you did not expect this change.`,
    },
    { publicKey: ADMIN_EMAILJS_PUBLIC_KEY },
  );
}
