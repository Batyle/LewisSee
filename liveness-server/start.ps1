$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvRoot = if ($env:FACEATTEND_VENV) { $env:FACEATTEND_VENV } else { "C:\FaceAttend\liveness-venv" }
$python = Join-Path $venvRoot "Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
    throw "Liveness dependencies are not installed. Run .\liveness-server\setup.ps1 first."
}

$databaseConfig = Join-Path $root ".env.database"
if (Test-Path -LiteralPath $databaseConfig) {
    Get-Content -LiteralPath $databaseConfig | ForEach-Object {
        if ($_ -match "^\s*(DB_(?:CONNECTION|HOST|PORT|DATABASE|USERNAME|PASSWORD|SSL_MODE|SSL_CA))=(.*)$") {
            Set-Item -Path "Env:$($matches[1])" -Value $matches[2]
        }
    }
    Write-Host "Loaded database configuration from $databaseConfig"
} else {
    Write-Warning "No liveness-server/.env.database found. The attendance API will not connect until DB_* environment variables are set."
}

# This also works when launched from the repository root.
& $python -m uvicorn app:app --app-dir $root --host 127.0.0.1 --port 8000
