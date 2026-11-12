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

Instructor access requests are stored in the MySQL `instructors` table with `pending` status. After the Python API is running, admins can review, approve, or reject them from **Admin → Instructors**; the page reads the current records from the protected `/admin/instructors` API. When deploying a code update, redeploy or restart the Python API as well as rebuilding the frontend so the review endpoints are available.

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

### Deploy this project now (Vercel + Render + Aiven)

1. Push this repository to GitHub, then import it into Vercel. Vercel detects Vite automatically; its build command is `npm run build` and output directory is `dist`.
2. Create a Render **Blueprint** from the same repository. It reads `render.yaml` and deploys `liveness-server/Dockerfile`. In Render, provide the rotated `DB_PASSWORD` and an `ADMIN_JWT_SECRET` of at least 32 characters (do not put secrets in the repository). The service already has the Aiven host, port, user, database `LewisSee`, and required TLS mode. The Python API connects to MySQL; Vercel must call this API and must never receive the database password.
3. When Render finishes, copy its HTTPS address, for example `https://faceattend-liveness.onrender.com`. Add these Vercel Production variables and redeploy:

   ```text
   VITE_LIVENESS_API_URL=https://faceattend-liveness.onrender.com/liveness
   VITE_ATTENDANCE_API_URL=https://faceattend-liveness.onrender.com/attendance
   VITE_ADMIN_API_URL=https://faceattend-liveness.onrender.com/admin
   ```

4. The supplied container default allows Vercel subdomains. Add the same `VITE_` variables to Vercel Preview if preview deployments should work.

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
