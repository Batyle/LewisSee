# 👁️ LewisSee: Web-Based Attendance System

> A secure, event-driven facial-recognition attendance system with liveness checks and automated email notifications for The Lewis College.

## 📖 Overview

LewisSee is a web-based attendance platform for instructors and administrators at The Lewis College. Instead of relying on paper roll calls or sign-in sheets, instructors can enroll students, select a class and date, and record attendance after a student's enrolled face is recognized and the camera image passes a liveness check.

Each check-in is saved with its Philippine Standard Time and can be classified as **Present**, **Late**, or **Absent** using the session's time-in, grace period, and late threshold. Attendance records and session rules are stored in MySQL so instructors and administrators can review and manage them across devices. When EmailJS is configured and a student has an email address on file, LewisSee can send that student a check-in notification.

## ✨ Main Features

- **Facial attendance:** Recognizes enrolled students in the classroom workspace and records a check-in once per student, class, and date.
- **Liveness detection:** A Python service checks the camera frame for signs of a live face before a scan is recorded. This helps deter still-photo attempts but is not a guarantee against every spoofing method.
- **Time-based attendance policies:** Instructors can create and edit session rules, including required time-in, optional grace period, late threshold, and time-out. Status boundaries use Philippine Standard Time.
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

## 👥 About the Creators

LewisSee was developed by Group 7 for The Lewis College. The team members contributed in the following areas:

<table>
  <tr>
    <td align="center" width="33%">
      <img src="assets/creators/austin-dominic-valladolid.png" alt="Austin Dominic Valladolid" width="180" /><br />
      <strong>Austin Dominic Valladolid</strong><br />
      <em>Frontend/Backend Integration</em><br />
      Integrates the React frontend with backend services and coordinates the system's application workflows.
    </td>
    <td align="center" width="33%">
      <img src="assets/creators/luige-dela-torre.png" alt="Luige Dela Torre" width="180" /><br />
      <strong>Luige Dela Torre</strong><br />
      <em>Data Analysis and Database Integration</em><br />
      Works with attendance data and the MySQL database to support reliable data storage and retrieval.
    </td>
    <td align="center" width="33%">
      <img src="assets/creators/je-an-fombuena.png" alt="Je An Fombuena" width="180" /><br />
      <strong>Je An Fombuena</strong><br />
      <em>Frontend System Design, UI, and Documentation</em><br />
      Contributes to the interface and user experience, and documents the system and its workflows.
    </td>
  </tr>
</table>

## 📚 References

- Alhanaee, K., Alhammadi, M., Almenhali, N., & Shatnawi, M. (2021). Face recognition smart attendance system using deep transfer learning. *Procedia Computer Science, 192*, 4093–4102. https://doi.org/10.1016/j.procs.2021.09.185
- Aiven. (n.d.). *Managed MySQL*. Aiven. https://aiven.io/mysql
- Galbally, J., Marcel, S., & Fierrez, J. (2014). Biometric antispoofing methods: A survey in face recognition. *IEEE Access, 2*, 1530–1552. https://doi.org/10.1109/ACCESS.2014.2381273
- Kittur, P., Pasha, A., & Joshi, S. (2023). A review on anti-spoofing: Face manipulation and liveness detection. *2023 IEEE International Conference on Contemporary Computing and Communications (InC4)*, 1–6. https://doi.org/10.1109/InC457730.2023.10263159
- Nadukuda, N. (2025). A cloud-native framework for scalable web applications using React, Node.js, and event-driven microservices. *International Journal of Computer Engineering and Science, 12*(3), 45–58. https://doi.org/10.22399/ijcesen.5006

**Keywords:** facial recognition, attendance system, React, Vercel, Aiven MySQL, Python liveness service, event-driven programming, web application, LewisSee.

---

## Developer Setup and Deployment

## Liveness / anti-spoofing setup

The browser cannot reliably determine whether it is looking at a real person or a photo shown on a phone. This project therefore sends the live camera frame to a local Python liveness service based on the Silent Face Anti-Spoofing model used by the referenced `computervisioneng/face-attendance-system` project.

Install Python 3.10 first. The upstream model uses PyTorch 1.13, which does not support Python 3.13. Then, from the repository root in PowerShell, run:

```powershell
.\liveness-server\setup.ps1
.\liveness-server\start.ps1
```

Keep that service running at `http://127.0.0.1:8000` while running the Vite app. It is used automatically through `VITE_LIVENESS_API_URL`; the default is already `http://127.0.0.1:8000/liveness`.

## MySQL attendance database

For local system testing, after configuring the Node API database variables, run `npm run seed:test` from `server/`. It creates or resets the MySQL accounts `admin` / `admin123` and `employee` / `employee123` (the employee account is active).

Students (including their reference portrait and face descriptor) and dated attendance records are now stored by the Python service in MySQL. The browser uses `GET`/`PUT /attendance`; it never receives the MySQL password. The service creates the `students` and `attendance_records` tables on its first successful connection.

Instructor access requests are stored in the MySQL `instructors` table with `pending` status. After the Python API is running, admins can review, approve, or reject them from **Admin → Instructors**; the page reads the current records from the protected `/admin/instructors` API. Approving an instructor assigns a unique random `C-YYYY-NNN` ID; administrators can edit the ID, name, or password from the roster. Account edits send an update email to the instructor, but never include the password. The instructor ID column is added automatically by the local Python API or Vercel API; it is also included in the live schema below.

To create the tables manually in MySQL Workbench, connect to the Aiven service with `defaultdb` as the default schema, then open and run [liveness-server/schema.sql](liveness-server/schema.sql). It is safe to run more than once and does not delete data.

Run `setup.ps1` again once to install the MySQL driver. To save the values in a Git-ignored local file, run `setup.ps1` with `-ConfigureDatabase`; it prompts for the password without echoing it:

```powershell
.\liveness-server\setup.ps1 -ConfigureDatabase
.\liveness-server\start.ps1
```

Alternatively, set the database values in the same PowerShell session:

```powershell
$env:DB_CONNECTION = "mysql"
$env:DB_HOST = "mysql-17d8f649-huwaiiboyjustboy-b83e.d.aivencloud.com"
$env:DB_PORT = "28270"
$env:DB_DATABASE = "LewisSee"
$env:DB_USERNAME = "avnadmin"
$env:DB_PASSWORD = "your_database_password"
$env:DB_SSL_MODE = "REQUIRED"
.\liveness-server\start.ps1
```

Use [liveness-server/.env.database.example](liveness-server/.env.database.example) as the variable reference. Do not add `DB_PASSWORD` or a `DATABASE_URL` to `.env.local`: every `VITE_` value is compiled into the browser. The `DATABASE_URL` string from templated hosts is not needed here; the five `DB_*` values above are used directly.

For Aiven MySQL, set `DB_SSL_MODE=REQUIRED`; this encrypts the connection. For certificate verification, download the CA certificate from **Aiven Console → service Overview → Connection information**, set `DB_SSL_MODE=VERIFY_IDENTITY`, and set `DB_SSL_CA` to its path. `DB_DATABASE` is `LewisSee` for this project.

For a deployed React site, deploy the Python service with those same `DB_*` variables and configure the public API URL before rebuilding the site:

```text
VITE_ATTENDANCE_API_URL=https://YOUR-LIVENESS-HOST/attendance
```

The initial load migrates the existing `attendance-students` and `attendance-records` browser cache only when the SQL database has no rows. Thereafter SQL is the source of truth. Back up biometric data and restrict the API to authenticated staff before exposing it publicly.

## Vercel deployment

Vercel hosts the React app, but cannot use the `127.0.0.1` service on your development computer. Deploy the liveness API as a separate Docker web service using [liveness-server/Dockerfile](liveness-server/Dockerfile). For example, build it with:

```powershell
docker build -t faceattend-liveness .\liveness-server
docker run --rm -p 8000:8000 -e LIVENESS_CORS_ORIGINS=https://YOUR-PROJECT.vercel.app faceattend-liveness
```

Deploy that same image to a Docker-capable host, then set these Vercel **Production** environment variables and redeploy the Vercel project:

```text
VITE_LIVENESS_API_URL=https://YOUR-LIVENESS-HOST/liveness
VITE_ATTENDANCE_API_URL=https://YOUR-LIVENESS-HOST/attendance
VITE_ADMIN_API_URL=https://YOUR-LIVENESS-HOST/admin
```

Set the same variables for Vercel Preview deployments if you test preview builds. The Render service needs `DB_PASSWORD` and an `ADMIN_JWT_SECRET` of at least 32 characters; the database host, port, name, username, and TLS mode are configured by `render.yaml`. The container accepts `*.vercel.app` origins by default. For a custom Vercel domain, add its exact origin to `LIVENESS_CORS_ORIGINS` on the API service. Never set a `VITE_` variable to the MySQL password, and do not point Vercel at `http://127.0.0.1:8000`: that address refers to each visitor's own device.

If the service is offline or the frame is classified as a photo/screen, attendance is not saved. The model reduces presentation attacks but should not be treated as a guarantee against every advanced replay or deepfake attack.

### Deploy this project (Vercel + Aiven; Render only for face liveness/attendance)

1. Push this repository to GitHub, then import it into Vercel. Set **Root Directory** to the repository root (not `client`) so Vercel can find both the root Vite app and its `api/` functions. Vercel detects Vite automatically; its build command is `npm run build` and output directory is `dist`. The `api/` directory deploys explicit admin, instructor-request, instructor-login, and class-list routes as Vercel Functions, so these endpoints read the live MySQL database without a separate Render service.
2. In Vercel, open **Project → Settings → Environment Variables** and add these server-side variables for **Production** (and Preview if used):

   ```text
   DB_HOST=mysql-17d8f649-huwaiiboyjustboy-b83e.d.aivencloud.com
   DB_PORT=28270
   DB_DATABASE=LewisSee
   DB_USERNAME=avnadmin
   DB_PASSWORD=YOUR_NEW_AIVEN_PASSWORD
   DB_SSL_MODE=REQUIRED
   ADMIN_JWT_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
   ```

   Enter the rotated database password in Vercel; never commit it or use a `VITE_` prefix. Create a different long random JWT secret and keep it private. Vercel Functions use the project’s server-side environment and never send these values to the browser.
3. Remove any `VITE_ADMIN_API_URL` value that points to Render or localhost. Production uses the same-origin Vercel Functions at `/api` regardless of that setting, so the variable is not needed. The instructor-request form and the Admin → Instructors page will then use the same Aiven database.
4. Attendance scanning still needs the Python service for anti-spoofing and attendance storage. If you use Render for that service, set its `DB_PASSWORD` to the rotated Aiven password too, deploy it, and set its HTTPS endpoints in Vercel:

   ```text
   VITE_LIVENESS_API_URL=https://YOUR-RENDER-HOST/liveness
   VITE_ATTENDANCE_API_URL=https://YOUR-RENDER-HOST/attendance
   ```

   The Render service also needs `ADMIN_JWT_SECRET` if it verifies instructor sessions. Use the same secret value as Vercel when both services need to verify the same tokens.
5. After saving Vercel environment variables, open **Deployments**, redeploy the latest production deployment, and wait for it to finish. Open `https://YOUR-VERCEL-DOMAIN/api/blocks`; a JSON response containing `blocks` confirms the Vercel Function can read MySQL. Then submit an instructor access request and check **Admin → Instructors**.

`/health` is the Render health check. Opening the Vercel URL and enrolling a student will create the MySQL tables automatically. Aiven's connection details were tested against `LewisSee` with TLS successfully; the password is intentionally not saved in this repository.

## GitHub Pages deployment

The included GitHub Actions workflow deploys the React site on every push to `main`. In the repository's **Settings → Pages**, select **GitHub Actions** as the build source. The workflow automatically uses the correct `/repository-name/` path, including for the browser face-model files.

GitHub Pages hosts static files only; it cannot run `liveness-server`, Python, or the anti-spoofing model. For a deployed site, host `liveness-server` on a Python-capable HTTPS service and set these GitHub **Actions variables** before deploying:

- `VITE_LIVENESS_API_URL` — the HTTPS endpoint, for example `https://liveness.example.com/liveness`.
- The `VITE_EMAILJS_*` and `VITE_FIREBASE_*` values from `.env.example` if those services are enabled.

Set `LIVENESS_CORS_ORIGINS=https://YOUR-GITHUB-USER.github.io` on the liveness host (use a comma-separated list to allow additional origins). A GitHub Pages site is HTTPS, so browsers will block its requests to the local `http://127.0.0.1:8000` service; use an HTTPS liveness endpoint for the public deployment. Local development continues to use the default URL in `.env.example`.

## EmailJS setup

The local EmailJS settings are stored in `.env.local`; it is ignored by Git. Copy `.env.example` when setting up another machine, then provide its public key. The deployed GitHub Pages build uses repository **Actions variables** with those same `VITE_EMAILJS_*` names.

In EmailJS, set the template's recipient field to `{{to_email}}`. The app supplies `to_email`, `to_name`, `student_name`, `student_id`, `class_name`, `attendance_date`, `attendance_time`, and `message`.

For example, the email body can contain: `Hello {{student_name}}, {{message}}`

Instructor approvals and rejections use the configured admin EmailJS template (`service_mviuuof` / `template_31qn7az`). Account edits send a separate update notification using the same template by default, with a different message and `decision=updated`; to use a separately designed template, set `VITE_INSTRUCTOR_UPDATE_TEMPLATE_ID` in `.env.local` or as a Vercel/GitHub Actions variable. Set that template's **To Email** to `{{to_email}}`; it can use `to_name`, `instructor_name`, `instructor_id`, `decision`, `status`, `changed_fields`, and `message`. Approval templates can also use `instructor_id` to show the newly assigned ID. The EmailJS public key is used by the browser and must never be treated as a private access token. If **Reply To** is set to `{{email}}`, set the optional `VITE_ADMIN_NOTIFICATION_REPLY_TO` to an admin/support address you monitor; otherwise remove `{{email}}` from Reply To and use the service's default sender. Passwords are never included in these emails. A successful EmailJS response means it accepted the send request, not that the recipient's provider placed it in the inbox. The admin page shows the recipient and HTTP response and recommends checking EmailJS **Email History** and spam/junk. If EmailJS rejects a request, its response is shown; the account change remains saved.

EmailJS domain allowlisting is an optional paid-plan security feature. It is not needed for EmailJS's free plan; if you later enable it, allow the local development origin and the GitHub Pages origin (for example, `http://localhost:5173` and `https://batyle.github.io`).

Restart the Vite development server after changing any `VITE_` setting.

## Firebase staff access

Firebase is still optionally used for staff Email/Password sign-in. Student and attendance data are stored in MySQL through the Python API instead of Firebase Realtime Database. Browser storage is only an offline cache used for the first MySQL migration.

The Firebase configuration is in `.env.local` and its variable names are included in `.env.example`.

Before deploying, enable **Email/Password** sign-in in Firebase Authentication, create the staff accounts, and assign each approved account the custom claim `staff: true` using the Firebase Admin SDK. Deploy `database.rules.json` as the Realtime Database rules. The rules require both authentication and that claim to read or write `/face-attendance`; changing the web page or browser storage cannot bypass them.

Do not use public database rules for biometric data. Firebase client configuration is intentionally public and is not an authorization mechanism; the database rules are what protect the records.
