# Passive Face Attendance (Python)

A local Python webcam/IP-camera attendance application. It recognises enrolled faces, applies silent per-frame passive liveness checks, and writes attendance to SQLite. It does **not** use blink, smile, voice, head-turn, or any user challenge.

## Important security note

LBP and Laplacian variance are useful low-cost filters for obvious printed photos, blurred replays, and many phone-screen attacks. They are not a production-grade presentation-attack detector by themselves: a high quality display or a replay video can reproduce texture and sharpness. For a high-stakes deployment, use the same interface with a trained PAD model such as MiniFASNet, calibrate it on the deployed camera, and retain human review for rejected/accepted records.

## Layout

```text
passive_attendance/
├── attendance.py             # SQLite logging and cool-down handling
├── embeddings.py             # Enrollment loading and embedding matching
├── liveness.py               # Silent LBP + Laplacian liveness gate
├── main.py                   # Webcam/IP camera application
├── requirements.txt
├── known_faces/
│   └── 2024-001_Ana_Santos/
│       ├── front.jpg
│       └── side.jpg
└── data/
    └── attendance.sqlite3    # Created automatically
```

Each enrollment folder must use `<student_id>_<name>`. Add 3 to 10 clear, single-person photos per student with different natural lighting and expressions. The enrollment image is not used for liveness; it only supplies recognition embeddings.

## Prerequisites

- Python 3.10 or 3.11 (64-bit).
- A connected webcam, or an RTSP/HTTP IP-camera URL.
- On Windows, install **Visual Studio Build Tools** with the **Desktop development with C++** workload and the Windows SDK before installing `dlib`/`face-recognition` if a compatible wheel is not available.
- On Ubuntu/Debian, install `build-essential cmake libopenblas-dev liblapack-dev` before `pip install` if dlib must compile.

## Install

From this `passive_attendance` folder:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

If PowerShell blocks activation, run `Set-ExecutionPolicy -Scope Process Bypass` once for the current terminal, then activate again.

## Run

```powershell
python main.py --camera 0
```

For an IP camera:

```powershell
python main.py --camera "rtsp://username:password@camera-host:554/stream"
```

Press `q` while the preview window is focused to stop. Records are saved in `data/attendance.sqlite3`, with UTC timestamp, student ID, name, and `Present` status. The default cool-down is 300 seconds:

```powershell
python main.py --camera 0 --cooldown 600 --tolerance 0.46
```

`--tolerance` controls recognition similarity: lower values are stricter. Start at `0.48`; do not raise it merely to make hard matches succeed. Improve enrollment photos instead.

## Silent liveness logic

`liveness.is_live(face_image)` receives a cropped face on every frame and returns a boolean.

1. The crop is converted to grayscale and normalized.
2. Uniform Local Binary Pattern (LBP) measures local skin texture. The interior-bin mass and histogram entropy reject unusually flat or low-detail surfaces.
3. Laplacian variance measures high-frequency detail. Very low values often indicate blur/replay; very high values can indicate screen moire or compression artifacts.
4. If an optional real-skin reference histogram is supplied, the current LBP histogram must also remain within its configured L1 distance.

No instruction is displayed to the student and no active action is required.

## Calibrate before use

The defaults in `liveness.py` are only conservative starting values. Capture at least 100 samples each of: real faces, printed photos, phone photo replays, and phone video replays using the actual camera and normal classroom lighting. Measure false accept and false reject rates, then tune through environment variables:

```powershell
$env:LIVENESS_MIN_TEXTURE_MASS="0.32"
$env:LIVENESS_MIN_LBP_ENTROPY="1.15"
$env:LIVENESS_MIN_LAPLACIAN_VARIANCE="28"
$env:LIVENESS_MAX_LAPLACIAN_VARIANCE="2800"
python main.py
```

For a site-specific LBP comparison, save a normalized 10-value NumPy LBP histogram built from genuine face crops, then configure:

```powershell
$env:LIVENESS_REFERENCE_HISTOGRAM="C:\secure-config\real_skin_lbp.npy"
$env:LIVENESS_MAX_REFERENCE_DISTANCE="0.42"
```

Do not store face images or embeddings in a publicly accessible directory. Restrict access to the SQLite database, follow your school privacy policy, and obtain consent before collecting biometric data.
