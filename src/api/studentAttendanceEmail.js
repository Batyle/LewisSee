import emailjs from "@emailjs/browser";
import { formatEmailDate, formatEmailTime } from "../attendancePolicy.js";

// Authoritative student attendance EmailJS credentials (do not let stale Vercel env override these).
// Keep separate from admin → instructor EmailJS (service_42lrlwk / template_cgf0ftr).
export const STUDENT_EMAILJS_SERVICE_ID = "service_sa8ojt8";
export const STUDENT_EMAILJS_TEMPLATE_ID = "template_986zsnj";
const STUDENT_EMAILJS_PUBLIC_KEY = "8nvcTW8G6rXutzdGM";

const STATUS_STYLES = {
  Present: { color: "#087957", background: "#e6fbf5" },
  Late: { color: "#9a5700", background: "#fff3d6" },
  Absent: { color: "#b42318", background: "#ffebe9" },
};

export async function sendAttendanceEmail(student, record, attendancePhoto) {
  const recipient = student.email?.trim();
  if (!recipient) throw new Error("This student does not have an email address.");

  const statusStyles = STATUS_STYLES[record.status];
  if (!statusStyles) throw new Error("Attendance status is invalid; the email was not sent.");

  await emailjs.send(
    STUDENT_EMAILJS_SERVICE_ID,
    STUDENT_EMAILJS_TEMPLATE_ID,
    {
      to_email: recipient,
      recipient_email: recipient,
      student_email: recipient,
      email: recipient,
      to_name: student.name,
      student_name: student.name,
      student_id: student.studentId,
      class_name: record.section,
      attendance_date: formatEmailDate(record.date),
      attendance_time: formatEmailTime(record.time),
      attendance_status: record.status,
      status_color: statusStyles.color,
      status_background: statusStyles.background,
      message: `Your attendance was recorded as ${record.status}. A photo from the verified face scan is attached.`,
      attendance_photo: attendancePhoto,
    },
    { publicKey: STUDENT_EMAILJS_PUBLIC_KEY },
  );
  return true;
}

export function emailErrorMessage(error) {
  const detail = typeof error?.text === "string" ? error.text : error?.message;
  return detail ? `Email could not be sent: ${detail}` : "Email could not be sent.";
}
