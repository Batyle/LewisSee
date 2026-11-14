# 👁️ LewisSee: Web-Based Attendance System

> A secure, event-driven facial-recognition attendance system with liveness checks and automated email notifications for The Lewis College.

## 📖 Overview

LewisSee is a web-based attendance platform for instructors and administrators at The Lewis College. Instead of relying on paper roll calls or sign-in sheets, instructors can enroll students, select a class and date, and record attendance after a student's enrolled face is recognized and the camera image passes a liveness check.

Each check-in is saved with its Philippine Standard Time and can be classified as **Present**, **Late**, or **Absent** using the session's time-in and optional late time ranges. Attendance records and session rules are stored in MySQL so instructors and administrators can review and manage them across devices. When EmailJS is configured and a student has an email address on file, LewisSee can send that student a check-in notification.

## ✨ Main Features

- **Facial attendance:** Recognizes enrolled students in the classroom workspace and records a check-in once per student, class, and date.
- **Liveness detection:** A Python service checks the camera frame for signs of a live face before a scan is recorded. This helps deter still-photo attempts but is not a guarantee against every spoofing method.
- **Attendance policies:** Instructors can use scheduled check-in/late/time-out windows or choose manual attendance, which stays open for the selected date until they press **Attendance ends**. Live scans are accepted only for the session date; valid check-ins send email notifications. Scheduled status boundaries use Philippine Standard Time.
- **Attendance history:** Search, sort, review, correct, and remove saved attendance records.
- **Student enrollment:** Instructors can enroll students with a reference photo and class assignment.
- **Instructor and administrator workspaces:** Instructors manage classroom attendance; administrators review instructor access requests and manage instructor accounts.
- **Email notifications:** EmailJS can send check-in notifications to students with an email address on file, notify administrators when an instructor access request is submitted, and send instructors administrator decisions and account updates.
- **Responsive interface:** The attendance and administration workflows adapt to mobile and desktop screens.

## 🛠️ Tech Stack

| Area | Technology |
| --- | --- |
| Frontend | React, Vite, CSS/Tailwind |
| API and liveness service | Python, FastAPI |
| Database | MySQL hosted on Aiven |
| Deployment | Vercel for the web app; a separate HTTPS-capable host for Python liveness and attendance APIs |
| Email | EmailJS |
| Source control and CI | GitHub and GitHub Actions |

## 🖱️ Event-Driven Architecture

The interface responds to user and browser events to keep attendance workflows interactive. Examples include:

- **Pointer and form events** for navigation, session setup, enrollment, and record editing.
- **Input events** for searching and filtering attendance records as the user types.
- **Keyboard form submission** for submitting forms with the keyboard.
- **File input events** for uploading student reference photos.
- **Asynchronous events** for camera permission, face detection, liveness verification, API requests, and email delivery.
- **Timer and page lifecycle events** for elapsed-time displays, scanner frame scheduling, camera cleanup, and pausing the scanner when the page is hidden.
- **Network events** for responding to browser connectivity changes.

## ⚠️ System Requirements and Limitations

- **Internet access:** The app relies on hosted database and API services for shared attendance data. The liveness service must be running locally for local scanning or deployed to an HTTPS endpoint for public deployments.
- **Camera permission and secure context:** The instructor must allow camera access from the browser before scanning starts. Camera access generally requires HTTPS, except on localhost.
- **Camera and lighting:** Face recognition works best with a usable camera, adequate lighting, and a clear view of the student's face.
- **Liveness limitations:** Anti-spoofing reduces the risk of a still-image check-in but cannot guarantee detection of every advanced replay or deepfake.
- **Biometric privacy:** Student reference photos and face descriptors are sensitive data. Limit access to authorized staff and protect the database and API credentials.
- **Attendance email photos and status:** EmailJS sends a photo and Present/Late status only for recognized, live-verified scans during today's scheduled window. Students who do not scan are not automatically marked absent or emailed. Obtain consent before enabling photo attachments and follow the institution's image-retention policy.

## 👥 About the Creators

LewisSee was developed by Group 7 for The Lewis College. The team members contributed in the following areas:

<table>
  <tr>
    <td align="center" width="33%">
      <img src="assets/creators/austin-dominic-valladolid.png" alt="Austin Dominic Valladolid" width="180" /><br />
      <strong>Austin Dominic Valladolid</strong><br />
      <em>Data Analysis and Database Integration</em><br />
      Works with attendance data and the MySQL database to support reliable data storage and retrieval.
    </td>
    <td align="center" width="33%">
      <img src="assets/creators/luige-dela-torre-corrected.jpg" alt="Luige Dela Torre" width="180" /><br />
      <strong>Luige Dela Torre</strong><br />
      <em>Frontend/Backend Integration</em><br />
      Connects the React frontend with backend services and helps bring the system's attendance workflows together.
    </td>
    <td align="center" width="33%">
      <img src="assets/creators/je-an-fombuena-corrected.jpg" alt="Je An Fombuena" width="180" /><br />
      <strong>Je An Fombuena</strong><br />
      <em>Frontend System Design, UI, and Documentation</em><br />
      Contributes to the interface and user experience, and documents the system and its workflows.
    </td>
  </tr>
</table>

## 📚 References

- Alhanaee, K., Alhammadi, M., Almenhali, M., & Shatnawi, M. (2021). Face recognition smart attendance system using deep transfer learning. *Procedia Computer Science, 192*, 4093–4102. https://doi.org/10.1016/j.procs.2021.09.185
- Aiven. (n.d.). *Managed MySQL*. Aiven. https://aiven.io/mysql
- Galbally, J., Marcel, S., & Fierrez, J. (2014). Biometric antispoofing methods: A survey in face recognition. *IEEE Access, 2*, 1530–1552. https://doi.org/10.1109/ACCESS.2014.2381273
- Kittur, P., Pasha, A., & Joshi, S. (2023). A review on anti-spoofing: Face manipulation and liveness detection. *2023 IEEE International Conference on Contemporary Computing and Communications (InC4)*, 1–6. https://doi.org/10.1109/InC457730.2023.10263159
- Nadukuda, N. (2025). A cloud-native framework for scalable web applications using React, Node.js, and event-driven microservices. *International Journal of Computer Engineering and Science, 12*(3), 45–58. https://doi.org/10.22399/ijcesen.5006

**Keywords:** facial recognition, attendance system, React, Vercel, Aiven MySQL, Python liveness service, event-driven programming, web application, LewisSee.
