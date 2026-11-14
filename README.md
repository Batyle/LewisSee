# FaceAttend

Students are marked present only after their enrolled face is recognized and the local liveness service verifies that the camera frame is a real face. Each new check-in sends an attendance email through EmailJS.

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

## Vite starter notes

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

# LewisSee
