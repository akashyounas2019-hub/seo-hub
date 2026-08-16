<#
.SYNOPSIS
    Install the GYL Claude Code worker as a Windows Task Scheduler task so it
    auto-starts at logon, restarts on crash, and survives reboots.

.DESCRIPTION
    Mirrors worker/install-launchd.sh (macOS launchd) using per-user Task
    Scheduler (no admin required). The task runs `node --env-file=.env.worker
    worker/claude-worker.mjs`, redirects stdout/stderr to .data/worker-logs/,
    and restarts every 30s if the process exits.

.PARAMETER Uninstall
    Remove the scheduled task and stop the worker.

.EXAMPLE
    # Install (or update) — run from repo root or the worker/ dir:
    powershell -ExecutionPolicy Bypass -File worker/install-scheduled-task.ps1

.EXAMPLE
    # Remove:
    powershell -ExecutionPolicy Bypass -File worker/install-scheduled-task.ps1 -Uninstall

.NOTES
    Task name : GYL-Claude-Worker
    To check  : Get-ScheduledTaskInfo -TaskName GYL-Claude-Worker
    To stop   : Stop-ScheduledTask -TaskName GYL-Claude-Worker
    To start  : Start-ScheduledTask -TaskName GYL-Claude-Worker
    Logs      : <repo>\.data\worker-logs\worker.{out,err}.log
#>
[CmdletBinding()]
param(
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$TaskName = 'GYL-Claude-Worker'
$Repo = Split-Path -Parent $PSScriptRoot   # worker/.. → repo root
$EnvFile = Join-Path $Repo '.env.worker'
$WorkerScript = Join-Path $Repo 'worker\claude-worker.mjs'
$LogDir = Join-Path $Repo '.data\worker-logs'
$RunnerScript = Join-Path $Repo 'worker\_run-worker.ps1'

function Remove-Existing {
    try {
        $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
        Write-Host "Removing existing task '$TaskName'..."
        try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop } catch {}
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    } catch {
        # Not registered — nothing to do.
    }
}

if ($Uninstall) {
    Remove-Existing
    Write-Host "OK Uninstalled $TaskName"
    exit 0
}

# ── Pre-flight ──────────────────────────────────────────────────────────
if (-not (Test-Path $EnvFile)) {
    Write-Host "FATAL: $EnvFile not found." -ForegroundColor Red
    Write-Host "Create it with:"
    Write-Host "  GYL_PORTAL_URL=http://localhost:3001"
    Write-Host "  GYL_WORKER_SECRET=<paste from /admin/agent/jobs/secret>"
    Write-Host "  GYL_CLAUDE_BIN=$( (Get-Command claude -ErrorAction SilentlyContinue).Source )"
    Write-Host "  GYL_CLAUDE_MAX_TURNS=25"
    exit 1
}
if (-not (Test-Path $WorkerScript)) {
    Write-Host "FATAL: $WorkerScript not found." -ForegroundColor Red
    exit 1
}

$Node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $Node) {
    Write-Host "FATAL: 'node' not on PATH. Install Node.js first." -ForegroundColor Red
    exit 1
}

$ClaudeBin = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $ClaudeBin) {
    Write-Host "WARNING: 'claude' CLI not found on your PATH." -ForegroundColor Yellow
    Write-Host "         The worker will fail unless GYL_CLAUDE_BIN in .env.worker is an absolute path."
}

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# ── Write the runner shim ──────────────────────────────────────────────
# Task Scheduler can't redirect stdout/stderr directly; use a small shim
# that runs node, tees output to log files, and exits with node's code so
# Task Scheduler's restart-on-failure fires. Kept as a separate file so we
# can update it without rebuilding the task.
$RunnerBody = @'
# GYL Claude Worker — Task Scheduler runner shim.
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
'@

# UTF-8 (no BOM) so PowerShell 5.1's Windows PowerShell reads it cleanly.
[System.IO.File]::WriteAllText($RunnerScript, $RunnerBody, (New-Object System.Text.UTF8Encoding($false)))

# ── (Re)register the task ──────────────────────────────────────────────
Remove-Existing

$Action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$RunnerScript`"" `
    -WorkingDirectory $Repo

# Two triggers so the worker survives everything:
#   1. AtLogOn        — starts as soon as you sign in.
#   2. Hourly hb      — re-fires every hour indefinitely; MultipleInstances=IgnoreNew
#                       above turns each re-fire into a no-op if the worker is
#                       already running, and into a fresh start if it isn't.
# PowerShell 5.1's New-ScheduledTaskTrigger doesn't accept an unbounded
# duration; use the max Task Scheduler tolerates via CIM directly (9999 days,
# well past any realistic reboot cycle) — this is effectively "forever".
$TriggerLogon  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$TriggerHourly = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Hours 1) `
    -RepetitionDuration (New-TimeSpan -Days 9999)
$Trigger = @($TriggerLogon, $TriggerHourly)

# Restart every minute (Task Scheduler's minimum granularity — its XML schema
# rejects anything smaller) up to the max count Task Scheduler allows (4).
# Don't stop on battery / when idle / when running long. This is the launchd
# KeepAlive + ThrottleInterval equivalent, coarser but semantically the same:
# if node dies, Task Scheduler restarts it. The runner-script tee also stamps
# each restart so we can see the loop in worker.out.log.
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -RestartCount 4 `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

$Principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

$Task = New-ScheduledTask `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description 'GYL Platform — Claude Code worker. Polls the portal, dispatches jobs to local Claude CLI. See worker/claude-worker.mjs.'

Register-ScheduledTask -TaskName $TaskName -InputObject $Task | Out-Null

# ── Start it now ───────────────────────────────────────────────────────
Start-ScheduledTask -TaskName $TaskName

Start-Sleep -Seconds 2
$info = Get-ScheduledTaskInfo -TaskName $TaskName

Write-Host ""
Write-Host "OK Installed scheduled task: $TaskName"
Write-Host "  Runner script : $RunnerScript"
Write-Host "  Logs          : $LogDir\worker.{out,err}.log"
Write-Host "  Last run time : $($info.LastRunTime)"
Write-Host "  Last result   : $($info.LastTaskResult) (0 = OK, running = 0x00041301)"
Write-Host ""
Write-Host "Handy commands:"
Write-Host "  Status  : Get-ScheduledTaskInfo -TaskName $TaskName"
Write-Host "  Stop    : Stop-ScheduledTask     -TaskName $TaskName"
Write-Host "  Start   : Start-ScheduledTask    -TaskName $TaskName"
Write-Host "  Tail    : Get-Content '$LogDir\worker.out.log' -Wait -Tail 20"
Write-Host "  Remove  : powershell -File worker/install-scheduled-task.ps1 -Uninstall"
