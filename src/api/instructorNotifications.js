import emailjs from "@emailjs/browser";

const ADMIN_EMAILJS_SERVICE_ID = "service_mviuuof";
const ADMIN_EMAILJS_TEMPLATE_ID = "template_31qn7az";
const ADMIN_EMAILJS_PUBLIC_KEY = "ltI55387fZQ7ayUP-";

export async function sendInstructorDecisionEmail(instructor, decision) {
  const replyTo = import.meta.env.VITE_ADMIN_NOTIFICATION_REPLY_TO?.trim();

  if (!instructor.email?.trim()) {
    throw new Error("The instructor account has no email address.");
  }

  const approved = decision === "approved";
  const message = approved
    ? "Your instructor access request has been approved. You can now sign in to LewisSee."
    : "Your instructor access request has been denied.";

  return emailjs.send(
    ADMIN_EMAILJS_SERVICE_ID,
    ADMIN_EMAILJS_TEMPLATE_ID,
    {
      to_email: instructor.email,
      to_name: instructor.name,
      email: replyTo || "",
      instructor_name: instructor.name,
      decision,
      status: approved ? "active" : "rejected",
      message,
      reason: instructor.rejectionReason || "",
    },
    { publicKey: ADMIN_EMAILJS_PUBLIC_KEY },
  );
}
