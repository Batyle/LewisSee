import emailjs from "@emailjs/browser";

const ADMIN_EMAILJS_SERVICE_ID = "service_mviuuof";
const ADMIN_EMAILJS_TEMPLATE_ID = "template_31qn7az";
const ADMIN_EMAILJS_PUBLIC_KEY = "ltI55387fZQ7ayUP-";

export async function sendInstructorDecisionEmail(instructor, decision) {
  const serviceId = import.meta.env.VITE_ADMIN_EMAILJS_SERVICE_ID?.trim() || ADMIN_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_ADMIN_EMAILJS_TEMPLATE_ID?.trim() || ADMIN_EMAILJS_TEMPLATE_ID;
  const publicKey = import.meta.env.VITE_ADMIN_EMAILJS_PUBLIC_KEY?.trim() || ADMIN_EMAILJS_PUBLIC_KEY;

  if (!instructor.email?.trim()) {
    throw new Error("The instructor account has no email address.");
  }
  if (!serviceId || !templateId || !publicKey) {
    throw new Error("Admin decision email is not configured for this deployment.");
  }

  const approved = decision === "approved";
  const message = approved
    ? "Your instructor access request has been approved. You can now sign in to LewisSee."
    : "Your instructor access request has been denied.";

  return emailjs.send(
    serviceId,
    templateId,
    {
      to_email: instructor.email,
      to_name: instructor.name,
      instructor_name: instructor.name,
      decision,
      status: approved ? "active" : "rejected",
      message,
      reason: instructor.rejectionReason || "",
    },
    { publicKey },
  );
}
