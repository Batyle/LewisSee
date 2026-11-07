# Installs the local liveness API dependencies after a fresh GitHub checkout.
# The upstream model pins PyTorch 1.13, which supports Python 3.10 but not 3.13.
[CmdletBinding()]
param(
    [string]$Python = "py",
    [string]$PythonVersion = "3.10",
    [switch]$RefreshModel,
    [switch]$ConfigureDatabase
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSCommandPath
$modelDirectory = Join-Path $root "Silent-Face-Anti-Spoofing"
$modelRequirements = Join-Path $modelDirectory "requirements.txt"
$modelFiles = Join-Path $modelDirectory "resources\anti_spoof_models"
# PyTorch uses deeply nested headers, so the default stays deliberately short.
$venvRoot = if ($env:FACEATTEND_VENV) { $env:FACEATTEND_VENV } else { "C:\FaceAttend\liveness-venv" }
$venvPython = Join-Path $venvRoot "Scripts\python.exe"

function Invoke-NativeCommand {
    param([Parameter(Mandatory)][scriptblock]$Command, [Parameter(Mandatory)][string]$FailureMessage)
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$FailureMessage (exit code $LASTEXITCODE)." }
}

function Initialize-DatabaseConfig {
    $configPath = Join-Path $root ".env.database"
    if (Test-Path -LiteralPath $configPath) {
        $replace = Read-Host "Database config already exists. Replace it? (y/N)"
        if ($replace -notmatch "^(y|yes)$") { return }
    }
    $host = Read-Host "MySQL host [sql.freedb.tech]"
    if ([string]::IsNullOrWhiteSpace($host)) { $host = "sql.freedb.tech" }
    $port = Read-Host "MySQL port [3306]"
    if ([string]::IsNullOrWhiteSpace($port)) { $port = "3306" }
    $database = Read-Host "MySQL database"
    $username = Read-Host "MySQL username"
    $securePassword = Read-Host "MySQL password" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    try {
        $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        if ([string]::IsNullOrWhiteSpace($database) -or [string]::IsNullOrWhiteSpace($username) -or [string]::IsNullOrWhiteSpace($password)) {
            throw "Database name, username, and password are required."
        }
        @(
            "DB_CONNECTION=mysql"
            "DB_HOST=$host"
            "DB_PORT=$port"
            "DB_DATABASE=$database"
            "DB_USERNAME=$username"
            "DB_PASSWORD=$password"
        ) | Set-Content -LiteralPath $configPath -Encoding utf8
        Write-Host "Saved local database configuration to $configPath"
    } finally {
        if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    }
}

if (-not (Get-Command $Python -ErrorAction SilentlyContinue)) {
    throw "Python launcher '$Python' was not found. Install Python $PythonVersion, or run .\setup.ps1 -Python 'C:\Path\python.exe'."
}
$pythonArgs = if ($Python -eq "py") { @("-$PythonVersion") } else { @() }
Invoke-NativeCommand { & $Python @pythonArgs --version } "Python $PythonVersion is required"

if ($RefreshModel -and (Test-Path -LiteralPath $modelDirectory)) {
    if (-not (Test-Path -LiteralPath (Join-Path $modelDirectory ".git"))) {
        throw "Cannot refresh '$modelDirectory' because it is not a Git checkout. Remove it manually, then run setup again."
    }
    Invoke-NativeCommand { git -C $modelDirectory fetch --depth 1 origin } "Could not update the anti-spoofing model"
    Invoke-NativeCommand { git -C $modelDirectory reset --hard origin/HEAD } "Could not update the anti-spoofing model"
}

if (-not (Test-Path -LiteralPath $modelDirectory)) {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw "Git is required to download the anti-spoofing model. Install Git for Windows and run setup again."
    }
    Invoke-NativeCommand { git clone --depth 1 https://github.com/computervisioneng/Silent-Face-Anti-Spoofing.git $modelDirectory } "Could not download the anti-spoofing model"
}

# A cancelled clone can leave a directory behind. Repair it on the next run.
if (-not (Test-Path -LiteralPath $modelRequirements) -or -not (Test-Path -LiteralPath $modelFiles)) {
    if (Test-Path -LiteralPath (Join-Path $modelDirectory ".git")) {
        Write-Host "Repairing incomplete Silent Face model checkout..."
        Invoke-NativeCommand { git -C $modelDirectory reset --hard HEAD } "Could not repair the anti-spoofing model"
    }
}
if (-not (Test-Path -LiteralPath $modelRequirements) -or -not (Test-Path -LiteralPath $modelFiles)) {
    throw "The anti-spoofing model download is incomplete. Remove '$modelDirectory' and run setup again."
}

if (-not (Test-Path -LiteralPath $venvPython)) {
    Invoke-NativeCommand { & $Python @pythonArgs -m venv $venvRoot } "Could not create the virtual environment at '$venvRoot'"
}
if (-not (Test-Path -LiteralPath $venvPython)) {
    throw "The virtual environment was not created. Confirm Python $PythonVersion is installed."
}

Invoke-NativeCommand { & $venvPython -m pip install --upgrade pip } "Could not upgrade pip"
Invoke-NativeCommand { & $venvPython -m pip install -r $modelRequirements -r (Join-Path $root "requirements.txt") } "Could not install liveness dependencies"
if ($ConfigureDatabase) { Initialize-DatabaseConfig }
Write-Host "Liveness setup complete. Start it with: .\liveness-server\start.ps1"
