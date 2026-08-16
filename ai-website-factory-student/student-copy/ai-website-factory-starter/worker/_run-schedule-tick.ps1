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