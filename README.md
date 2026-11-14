# 👁️ LewisSee: Web-Based Attendance System

> A secure, event-driven facial-recognition attendance system with liveness checks and automated email notifications for The Lewis College.

## 📖 Overview

LewisSee is a web-based attendance platform for instructors and administrators at The Lewis College. Instead of relying on paper roll calls or sign-in sheets, instructors can enroll students, select a class and date, and record attendance after a student's enrolled face is recognized and the camera image passes a liveness check.

Each check-in is saved with its Philippine Standard Time and can be classified as **Present**, **Late**, or **Absent** using the session's time-in and optional late time ranges. Attendance records and session rules are stored in MySQL so instructors and administrators can review and manage them across devices. When EmailJS is configured and a student has an email address on file, LewisSee can send that student a check-in notification.

## ✨ Main Features

- **Facial attendance:** Recognizes enrolled students in the classroom workspace and records a check-in once per student, class, and date.
- **Liveness detection:** A Python service checks the camera frame for signs of a live face before a scan is recorded. This helps deter still-photo attempts but is not a guarantee against every spoofing method.
- **Time-based attendance policies:** Instructors can create and edit start/end ranges for on-time check-in, an optional late period, and time-out. Scans during the time-in range are Present, scans during the late range are Late, and scans outside both are Absent. Status boundaries use Philippine Standard Time.
- **Attendance history:** Search, sort, review, correct, and remove saved attendance records.
- **Student enrollment:** Instructors can enroll students with a reference photo and class assignment.
- **Instructor and administrator workspaces:** Instructors manage classroom attendance; administrators review instructor access requests and manage instructor accounts.
- **Email notifications:** EmailJS can send check-in notifications to students with an email address on file. Administrator decisions and instructor account updates can also send email notifications when configured.
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

## 🚀 Production Deployment

The Vercel deployment serves the Vite frontend and its Node.js admin/auth functions. The Python service in `liveness-server` must run separately because it provides both the `/attendance` API and the `/liveness` check. `render.yaml` configures this service for Render; it uses the same MySQL database as the admin functions.

1. Deploy this repository to Vercel using the repository root as the project root, the default `npm run build` command, and `dist` as the output directory.
2. Deploy `liveness-server` to Render with the included `render.yaml`. Set `DB_PASSWORD` and `ADMIN_JWT_SECRET` in the Render service environment, along with the database settings required by your MySQL provider. The service URL must be public HTTPS; verify `https://<service-host>/health` responds before connecting the frontend.
3. In **Vercel → Project → Settings → Environment Variables**, set `VITE_LIVENESS_API_URL` to the Render service's public HTTPS URL ending in `/liveness` (for example `https://<your-render-service>.onrender.com/liveness`) for every environment you use, then redeploy. The app derives `/attendance` from this URL automatically. If attendance is hosted separately, set `VITE_ATTENDANCE_API_URL` to its full HTTPS `/attendance` endpoint too. Never use `localhost` or `127.0.0.1` for a hosted build.
4. The Render configuration allows `vercel.app` origins. For a Vercel custom domain or GitHub Pages, set Render's `LIVENESS_CORS_ORIGINS` to a comma-separated list of the exact site origins (scheme and host, no trailing slash), for example `https://your-domain.example,https://your-user.github.io`.
5. To deploy via GitHub Pages instead, set the repository's **Settings → Secrets and variables → Actions → Variables** entry `VITE_LIVENESS_API_URL` to the same HTTPS `/liveness` endpoint. `VITE_ATTENDANCE_API_URL` is optional unless attendance uses another host. Ensure GitHub Pages is enabled for the repository; pushing `main` then triggers the included Pages workflow.

Do not use a `127.0.0.1` or `localhost` API URL in a hosted build: on another device, that address points to that device itself. Keep database passwords and JWT secrets in the backend provider's secret environment, never in `VITE_*` variables.

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
