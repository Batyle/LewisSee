$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvRoot = if ($env:FACEATTEND_VENV) { $env:FACEATTEND_VENV } else { "C:\FaceAttend\liveness-venv" }
& "$venvRoot\Scripts\python.exe" -m uvicorn app:app --host 127.0.0.1 --port 8000
