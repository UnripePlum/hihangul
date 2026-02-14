param(
  [switch]$KeepCaller,
  [int]$ExcludePid = 0
)

$ErrorActionPreference = "Continue"

Write-Host "[stop-all] stopping HiHangul windows..."

$callerCmdPid = $null
if ($ExcludePid -gt 0) {
  $callerCmdPid = $ExcludePid
} elseif ($KeepCaller) {
  try {
    $self = Get-CimInstance Win32_Process -Filter "ProcessId = $PID"
    $callerCmdPid = [int]$self.ParentProcessId
  } catch { $callerCmdPid = $null }
}

$cmdProcs = Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'"
foreach ($proc in $cmdProcs) {
  $procPid = [int]$proc.ProcessId
  if ($callerCmdPid -and $procPid -eq $callerCmdPid) { continue }
  if ($procPid -eq $PID) { continue }

  $cmdline = ($proc.CommandLine | Out-String).Trim().ToLowerInvariant()
  if (-not $cmdline) { continue }

  Write-Host "[stop-all] killing PID $procPid :: $cmdline"
  & taskkill /F /PID $procPid /T | Out-Null
}

Write-Host "[stop-all] done"
