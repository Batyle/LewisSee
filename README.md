# FaceAttend

Students are marked present only after their enrolled face is recognized and the local liveness service verifies that the camera frame is a real face. Each new check-in sends an attendance email through EmailJS.

## Liveness / anti-spoofing setup

The browser cannot reliably determine whether it is looking at a real person or a photo shown on a phone. This project therefore sends the live camera frame to a local Python liveness service based on the Silent Face Anti-Spoofing model used by the referenced `computervisioneng/face-attendance-system` project.

Install Python 3.10 first. The upstream model uses PyTorch 1.13, which does not support Python 3.13. Then, in PowerShell, run:

```powershell
cd liveness-server
.\setup.ps1
.\start.ps1
```

Keep that service running at `http://127.0.0.1:8000` while running the Vite app. It is used automatically through `VITE_LIVENESS_API_URL`; the default is already `http://127.0.0.1:8000/liveness`.

If the service is offline or the frame is classified as a photo/screen, attendance is not saved. The model reduces presentation attacks but should not be treated as a guarantee against every advanced replay or deepfake attack.

## EmailJS setup

The local EmailJS settings are stored in `.env.local`; it is ignored by Git. Copy `.env.example` when setting up another machine, then provide its public key.

In EmailJS, set the template's recipient field to `{{to_email}}`. The app supplies `to_email`, `to_name`, `student_name`, `student_id`, `class_name`, `attendance_date`, `attendance_time`, and `message`.

For example, the email body can contain: `Hello {{student_name}}, {{message}}`

Restart the Vite development server after changing any `VITE_` setting.

## Firebase Realtime Database and staff access

The app synchronizes enrolled students and attendance records at the `/face-attendance` node in Firebase Realtime Database. Browser storage is only an offline cache; the protected database is the source of truth.

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
