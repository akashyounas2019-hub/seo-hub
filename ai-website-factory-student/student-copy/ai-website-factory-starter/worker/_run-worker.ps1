# GYL Claude Worker â€” Task Scheduler runner shim.
# Runs node --env-file=.env.worker worker/claude-worker.mjs and captures its
# stdout+stderr into a UTF-8 log file. Exits with node's code so Task Scheduler
# restarts the process on failure.
$ErrorActionPreference = 'Continue'

# Force UTF-8 for both console and this process. Windows PowerShell 5.1 defaults
# to UTF-16 when writing files with Out-File, which garbles node's UTF-8 output.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$Repo = Split-Path -Parent $PSScriptRoot
Set-Location $Repo

$LogDir = Join-Path $Repo '.data\worker-logs'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$OutLog = Join-Path $LogDir 'worker.out.log'
$ErrLog = Join-Path $LogDir 'worker.err.log'

# Rotate logs once they get big (>2MB) so we don't grow unbounded.
foreach ($f in @($OutLog, $ErrLog)) {
    if ((Test-Path $f) -and ((Get-Item $f).Length -gt 2MB)) {
        Move-Item $f "$f.1" -Force
    }
}

$EnvFile = Join-Path $Repo '.env.worker'
$WorkerJs = Join-Path $Repo 'worker\claude-worker.mjs'

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# Stamp the log so we can see restarts (UTF-8, no BOM).
[System.IO.File]::AppendAllText($OutLog, "[runner] $(Get-Date -Format o) - starting node worker`r`n", $Utf8NoBom)

# Exec node. Redirect stderr into stdout (2>&1), then write each line via
# .NET APIs so the file stays UTF-8 (Out-File would re-encode as UTF-16 on 5.1).
& node "--env-file=$EnvFile" $WorkerJs 2>&1 | ForEach-Object {
    $line = if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { [string]$_ }
    [System.IO.File]::AppendAllText($OutLog, $line + "`r`n", $Utf8NoBom)
}

$code = $LASTEXITCODE
[System.IO.File]::AppendAllText($OutLog, "[runner] $(Get-Date -Format o) - node exited with code $code`r`n", $Utf8NoBom)
exit $code