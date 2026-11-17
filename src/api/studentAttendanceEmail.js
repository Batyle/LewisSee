import emailjs from "@emailjs/browser";
import { formatEmailDate, formatEmailTime } from "../attendancePolicy.js";
import { sendWithRetry } from "./emailRetry.js";
import { requireEmailJsSettings, STUDENT_ATTENDANCE_EMAILJS } from "./emailConfig.js";

const STATUS_STYLES = {
  Present: { color: "#087957", background: "#e6fbf5" },
  Late: { color: "#9a5700", background: "#fff3d6" },
  Absent: { color: "#b42318", background: "#ffebe9" },
};

export async function sendAttendanceEmail(student, record, attendancePhoto, options) {
  requireEmailJsSettings(STUDENT_ATTENDANCE_EMAILJS, "Student attendance");
  const recipient = student.email?.trim();
  if (!recipient) throw new Error("This student does not have an email address.");

  const statusStyles = STATUS_STYLES[record.status];
  if (!statusStyles) throw new Error("Attendance status is invalid; the email was not sent.");

  await sendWithRetry(
    () => emailjs.send(
      STUDENT_ATTENDANCE_EMAILJS.serviceId,
      STUDENT_ATTENDANCE_EMAILJS.templateId,
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
      { publicKey: STUDENT_ATTENDANCE_EMAILJS.publicKey },
    ),
    options,
  );
  return true;
}

export function emailErrorMessage(error) {
  const detail = typeof error?.text === "string" ? error.text : error?.message;
  return detail ? `Email could not be sent: ${detail}` : "Email could not be sent.";
}
