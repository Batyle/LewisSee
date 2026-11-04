# The upstream model requires Python 3.10 because its pinned PyTorch 1.13
# packages are incompatible with Python 3.13.
param([string]$Python = "py -3.10")

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$modelDirectory = Join-Path $root "Silent-Face-Anti-Spoofing"

if (-not (Test-Path -LiteralPath $modelDirectory)) {
    git clone --depth 1 https://github.com/computervisioneng/Silent-Face-Anti-Spoofing.git $modelDirectory
}

# A clone interrupted while files are being checked out can leave the folder
# and its .git directory behind, but no usable model files. Restore the known
# upstream checkout before attempting to install its requirements.
$modelRequirements = Join-Path $modelDirectory "requirements.txt"
if (-not (Test-Path -LiteralPath $modelRequirements)) {
    if (Test-Path -LiteralPath (Join-Path $modelDirectory ".git")) {
        Write-Host "Repairing incomplete Silent Face model checkout..."
        git -C $modelDirectory restore --source=HEAD --staged --worktree .
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $modelRequirements)) {
            throw "Could not restore the Silent Face model checkout. Delete '$modelDirectory' and run setup again."
        }
    } else {
        throw "The Silent Face model folder is incomplete. Delete '$modelDirectory' and run setup again."
    }
}

# PyTorch contains deeply nested headers. A venv beside this project can
# exceed Windows' legacy path limit, so keep the generated environment short.
$venvRoot = if ($env:FACEATTEND_VENV) { $env:FACEATTEND_VENV } else { "C:\FaceAttend\liveness-venv" }
$venvPython = Join-Path $venvRoot "Scripts\python.exe"
if (-not (Test-Path -LiteralPath $venvPython)) {
    Invoke-Expression "$Python -m venv `"$venvRoot`""
}
if (-not (Test-Path -LiteralPath $venvPython)) {
    throw "Could not create the Python virtual environment. Confirm Python 3.10 is installed."
}

& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r "$modelDirectory\requirements.txt" -r "$root\requirements.txt"
