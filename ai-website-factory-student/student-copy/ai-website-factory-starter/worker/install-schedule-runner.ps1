<#
.SYNOPSIS
    Install the agent_schedules runner as a Windows Scheduled Task that fires
    every 5 minutes. Reads due agent_schedules rows and inserts a claude_jobs
    row per fire — the Mac worker picks it up on its next 30s poll cycle.

.PARAMETER Uninstall
    Remove the scheduled task and stop the runner.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File worker/install-schedule-runner.ps1

.NOTES
    Task name : GYL-Schedule-Runner
    Cadence   : every 5 minutes
    Logs      : <repo>\.data\worker-logs\schedule-runner.log
#>
[CmdletBinding()]
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$TaskName = 'GYL-Schedule-Runner'
$Repo = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Repo '.data\worker-logs'
$RunnerScript = Join-Path $Repo 'worker\_run-schedule-tick.ps1'

function Remove-Existing {
    try {
        Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop | Out-Null
        Write-Host "Removing existing task '$TaskName'..."
        try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop } catch {}
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    } catch {}
}

if ($Uninstall) {
    Remove-Existing
    Write-Host "OK Uninstalled $TaskName"
    exit 0
}

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# Runner shim — cd into repo, run the npm script, tee output to a log.
$RunnerBody = @'
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$Repo = Split-Path -Parent $PSScriptRoot
Set-Location $Repo
$LogDir = Join-Path $Repo '.data\worker-logs'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$Log = Join-Path $LogDir 'schedule-runner.log'
if ((Test-Path $Log) -and ((Get-Item $Log).Length -gt 2MB)) { Move-Item $Log "$Log.1" -Force }
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::AppendAllText($Log, "[runner] $(Get-Date -Format o) - tick starting`r`n", $Utf8NoBom)
& npm run agent:schedules:tick 2>&1 | ForEach-Object {
    $line = if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { [string]$_ }
    [System.IO.File]::AppendAllText($Log, $line + "`r`n", $Utf8NoBom)
}
[System.IO.File]::AppendAllText($Log, "[runner] $(Get-Date -Format o) - tick done (exit $LASTEXITCODE)`r`n", $Utf8NoBom)
exit $LASTEXITCODE
'@
[System.IO.File]::WriteAllText($RunnerScript, $RunnerBody, (New-Object System.Text.UTF8Encoding($false)))

Remove-Existing

$Action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$RunnerScript`"" `
    -WorkingDirectory $Repo

# Fire every 5 minutes indefinitely, starting from now.
$TriggerLogon  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$TriggerRepeat = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 5) `
    -RepetitionDuration (New-TimeSpan -Days 9999)

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

$Principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

$Task = New-ScheduledTask `
    -Action $Action `
    -Trigger @($TriggerLogon, $TriggerRepeat) `
    -Settings $Settings `
    -Principal $Principal `
    -Description 'GYL Platform — fires due agent_schedules rows into claude_jobs every 5 minutes.'

Register-ScheduledTask -TaskName $TaskName -InputObject $Task | Out-Null
Start-ScheduledTask -TaskName $TaskName

Start-Sleep -Seconds 2
$info = Get-ScheduledTaskInfo -TaskName $TaskName
Write-Host ""
Write-Host "OK Installed scheduled task: $TaskName"
Write-Host "  Runner script : $RunnerScript"
Write-Host "  Log           : $LogDir\schedule-runner.log"
Write-Host "  Last run time : $($info.LastRunTime)"
Write-Host "  Last result   : $($info.LastTaskResult)"
Write-Host ""
Write-Host "Handy:"
Write-Host "  Status : Get-ScheduledTaskInfo -TaskName $TaskName"
Write-Host "  Tail   : Get-Content '$LogDir\schedule-runner.log' -Wait -Tail 20"
Write-Host "  Stop   : Stop-ScheduledTask -TaskName $TaskName"
Write-Host "  Remove : powershell -File worker/install-schedule-runner.ps1 -Uninstall"
