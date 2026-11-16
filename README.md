# LewisSee: Web-Based Attendance System

> A secure, event-driven facial-recognition attendance system with liveness checks and automated email notifications for The Lewis College.

## Abstract

LewisSee is an online class and event attendance system for The Lewis College. It helps instructors and administrators manage student attendance and reduce manual roll calls using facial recognition and liveness checks. During a classroom session, an instructor uses a camera-enabled device to scan enrolled students. A successful face match and liveness check records the student's check-in time and attendance status. Liveness checks can deter attempts to check in with a still image, but cannot prevent every form of spoofing.

The frontend is built with React and Vite. Account and access APIs use Node.js and Express, while Python and FastAPI power attendance and liveness services. MySQL hosted on Aiven stores administrator, instructor, class group, student, attendance record, and attendance session data. The schema uses primary keys to identify records and unique constraints to prevent duplicate values or repeated check-ins where required. For example, an instructor's `uid` is the primary key, while an instructor ID such as `C-2024-073` is a separate unique value. Class groups are organized by course, year level, and block; attendance records include a student ID, class section, date, time, and a **Present**, **Late**, or **Absent** status. Role and account-status constraints help maintain valid account data, and student records store face descriptors for recognition. EmailJS can send automated notifications, and Vercel hosts the web app.

Event-driven interactions throughout the application include pointer, keyboard, and form input; reference-photo uploads; camera and recognition workflows; asynchronous API and email requests; scanner timers; and page lifecycle and network events. Features include live face scanning, scheduled attendance sessions, searchable attendance history, instructor-managed student enrollment, instructor and administrator account management, and automated email notifications.

Using LewisSee requires internet access and browser camera permission. Recognition accuracy may be affected by poor lighting, camera quality, or an obstructed face. Liveness detection cannot guarantee protection against every spoofing method. Students who are not scanned are not automatically marked absent, and staff must review attendance. Student photos, face descriptors, and other personal data should be protected and handled according to the institution's privacy and retention policies. LewisSee demonstrates how facial recognition, database management, and event-driven programming can support attendance workflows; the project does not claim a measured reduction in workload or errors.

##  Main Features

- **Facial attendance:** Recognizes enrolled students in the classroom workspace and records a check-in once per student, class, and date.
- **Liveness detection:** A Python service checks the camera frame for signs of a live face before a scan is recorded. This helps deter still-photo attempts but is not a guarantee against every spoofing method.
- **Attendance policies:** Instructors can use scheduled check-in/late/time-out windows or choose manual attendance, which stays open for the selected date until they press **Attendance ends**. Live scans are accepted only for the session date; valid check-ins send email notifications. Scheduled status boundaries use Philippine Standard Time.
- **Attendance history:** Search, sort, review, correct, and remove saved attendance records.
- **Student enrollment:** Instructors can enroll students with a reference photo and class assignment.
- **Instructor and administrator workspaces:** Instructors manage classroom attendance; administrators review instructor access requests and manage instructor accounts.
- **Email notifications:** EmailJS can send check-in notifications to students with an email address on file, notify administrators when an instructor access request is submitted, and send instructors administrator decisions and account updates.
- **Responsive interface:** The attendance and administration workflows adapt to mobile and desktop screens.

##  Tech Stack

| Area | Technology |
| --- | --- |
| Frontend and facial recognition | React, Vite, face-api.js |
| Account and access API | Node.js, Express |
| Attendance and liveness APIs | Python, FastAPI |
| Database | MySQL hosted on Aiven |
| Deployment | Vercel for the web app; separate hosts for backend APIs |
| Email | EmailJS |
| Source control and CI | GitHub and GitHub Actions |

##  Event-Driven Architecture

The interface responds to user and browser events to keep attendance workflows interactive. Examples include:

- **Pointer and form events** for navigation, session setup, enrollment, and record editing.
- **Input events** for searching and filtering attendance records as the user types.
- **Keyboard form submission** for submitting forms with the keyboard.
- **File input events** for uploading student reference photos.
- **Asynchronous events** for camera permission, face detection, liveness verification, API requests, and email delivery.
- **Timer and page lifecycle events** for elapsed-time displays, scanner frame scheduling, camera cleanup, and pausing the scanner when the page is hidden.
- **Network events** for responding to browser connectivity changes.

## System Requirements

- **Internet access:** The app relies on hosted database and API services for shared attendance data. The liveness service must be running locally for local scanning or deployed to an HTTPS endpoint for public deployments.
- **Camera permission and secure context:** The instructor must allow camera access from the browser before scanning starts. Camera access generally requires HTTPS, except on localhost.

## Limitations

> **Important:** Recognition depends on camera quality, lighting, and a clear view of the student's face. Liveness checks help deter spoofing but cannot guarantee detection of every still image, replay, or deepfake.

- **Attendance:** Students who do not scan are not automatically marked absent; staff must review attendance and apply the appropriate status.
- **Email notifications:** EmailJS must be configured and student email addresses must be available. Check-in notifications are sent only for recognized, live-verified scans during today's scheduled window. Obtain consent before enabling photo attachments and follow the institution's image-retention policy.
- **Biometric privacy:** Student reference photos and face descriptors are sensitive data. Limit access to authorized staff and protect the database and API credentials.

##  Members

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

## References

- Alhanaee, K., Alhammadi, M., Almenhali, M., & Shatnawi, M. (2021). Face recognition smart attendance system using deep transfer learning. *Procedia Computer Science, 192*, 4093–4102. https://doi.org/10.1016/j.procs.2021.09.184
- Aiven. (n.d.). *Managed MySQL*. Aiven. https://aiven.io/mysql
- Galbally, J., Marcel, S., & Fierrez, J. (2014). Biometric antispoofing methods: A survey in face recognition. *IEEE Access, 2*, 1530–1552. https://doi.org/10.1109/ACCESS.2014.2381273
- Kittur, P., Pasha, A., Joshi, S., & Kulkarni, V. (2023). A review on anti-spoofing: Face manipulation and liveness detection. *2023 IEEE International Conference on Computer Vision and Machine Intelligence (CVMI)*, 1–6. https://doi.org/10.1109/CVMI59935.2023.10464680
- Nadukuda, N. (2025). A cloud-native framework for scalable web applications using React, Node.js, and event-driven microservices. *International Journal of Computational and Experimental Science and Engineering, 11*(4). https://doi.org/10.22399/ijcesen.5006

**Keywords:** facial recognition, attendance management system, React, Vite, MySQL, database management, primary key, unique constraints, EmailJS, Vercel, liveness detection, event-driven programming, LewisSee.
