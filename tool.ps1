<#
.SYNOPSIS
Runs and manages the isolated CN portfolio demo on this computer.

.DESCRIPTION
Run without parameters for the interactive menu, or pass -Action for scripts.
The local database is isolated from the hosted Supabase project.

.PARAMETER Action
Menu, Start, Stop, StopAll, or Status. The default is Menu.

.EXAMPLE
.\tool.ps1

.EXAMPLE
.\tool.ps1 -Action Status
#>
[CmdletBinding()]
param(
  [ValidateSet('Menu', 'Start', 'Stop', 'StopAll', 'Status')]
  [string]$Action = 'Menu'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LocalProjectId = 'portfolio-live-demos-cn-local'
$StateDirectory = Join-Path $RepoRoot '.local-state'
$PidFile = Join-Path $StateDirectory 'cn-demo-dev.pid'
$RunnerFile = Join-Path $StateDirectory 'cn-demo-dev-runner.ps1'
$SupabaseCli = Join-Path $RepoRoot 'node_modules\.bin\supabase.cmd'
$TempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar)
$CnTempPrefix = 'cn-local-'

function Test-DockerReady {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return $false }
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'SilentlyContinue'
    & docker info --format '{{.ServerVersion}}' *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  } finally {
    $ErrorActionPreference = $previousPreference
  }
}

function Get-RunnerEncodedCommand {
  $escapedRunner = $RunnerFile.Replace("'", "''")
  return [Convert]::ToBase64String(
    [Text.Encoding]::Unicode.GetBytes("& '$escapedRunner'")
  )
}

function Get-TrackedProcess {
  if (-not (Test-Path -LiteralPath $PidFile)) { return $null }
  $storedPid = 0
  if (-not [int]::TryParse((Get-Content -LiteralPath $PidFile -Raw).Trim(), [ref]$storedPid)) {
    return $null
  }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $storedPid" -ErrorAction SilentlyContinue
  if (-not $process) { return $null }
  $encodedCommand = Get-RunnerEncodedCommand
  if ($process.Name -ne 'powershell.exe' -or $process.CommandLine -notlike "*$encodedCommand*") {
    return $null
  }
  return $process
}

function Remove-StaleCnTempWorkdirs {
  $folders = @(Get-ChildItem -LiteralPath $TempRoot -Directory -Filter "$CnTempPrefix*" -ErrorAction SilentlyContinue)
  if ($folders.Count -eq 0) { return }

  $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  $removedCount = 0
  $removedBytes = [long]0
  $skippedCount = 0

  foreach ($folder in $folders) {
    $target = [System.IO.Path]::GetFullPath($folder.FullName).TrimEnd([IO.Path]::DirectorySeparatorChar)
    $parent = [System.IO.Path]::GetDirectoryName($target).TrimEnd([IO.Path]::DirectorySeparatorChar)
    $leaf = [System.IO.Path]::GetFileName($target)

    if ($parent -ne $TempRoot -or -not $leaf.StartsWith($CnTempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      Write-Host "Refusing cleanup outside the expected CN temp path: $target" -ForegroundColor Red
      continue
    }

    $inUse = $false
    foreach ($process in $processes) {
      if ($process.CommandLine -and $process.CommandLine.IndexOf($target, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
        $inUse = $true
        break
      }
    }
    if ($inUse) {
      $skippedCount += 1
      Write-Host "Keeping active CN temp workdir: $target" -ForegroundColor Yellow
      continue
    }

    $size = (Get-ChildItem -LiteralPath $target -File -Recurse -ErrorAction SilentlyContinue |
      Measure-Object -Property Length -Sum).Sum
    if ($size) { $removedBytes += [long]$size }
    Remove-Item -LiteralPath $target -Recurse -Force
    $removedCount += 1
  }

  if ($removedCount -gt 0) {
    $removedMb = [math]::Round($removedBytes / 1MB, 2)
    Write-Host "Cleaned $removedCount stale CN temp workdir(s), freeing $removedMb MB." -ForegroundColor Green
  }
  if ($skippedCount -gt 0) {
    Write-Host "Skipped $skippedCount active CN temp workdir(s)." -ForegroundColor Yellow
  }
}

function Start-DockerIfNeeded {
  if (Test-DockerReady) {
    Write-Host 'Docker Desktop is ready.' -ForegroundColor Green
    return
  }
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker Desktop is not installed or docker.exe is unavailable.'
  }

  Write-Host 'Starting Docker Desktop...' -ForegroundColor Cyan
  & docker desktop start | Out-Host
  for ($attempt = 1; $attempt -le 60; $attempt += 1) {
    if (Test-DockerReady) {
      Write-Host 'Docker Desktop is ready.' -ForegroundColor Green
      return
    }
    Start-Sleep -Seconds 2
  }
  throw 'Docker Desktop did not become ready within two minutes.'
}

function Start-CnDemo {
  $running = Get-TrackedProcess
  if ($running) {
    Write-Host "CN local demo is already running (PID $($running.ProcessId))." -ForegroundColor Yellow
    Write-Host 'Open http://localhost:5173'
    return
  }

  Remove-StaleCnTempWorkdirs
  Start-DockerIfNeeded
  if (-not (Test-Path -LiteralPath $SupabaseCli)) {
    throw 'Dependencies are missing; run npm.cmd install --ignore-scripts first.'
  }

  New-Item -ItemType Directory -Path $StateDirectory -Force | Out-Null
  $escapedRoot = $RepoRoot.Replace("'", "''")
  @"
Set-Location -LiteralPath '$escapedRoot'
`$Host.UI.RawUI.WindowTitle = 'CN Demo - Local Development'
& npm.cmd run dev:cn-local
"@ | Set-Content -LiteralPath $RunnerFile -Encoding UTF8

  $encodedCommand = Get-RunnerEncodedCommand

  $terminal = Start-Process `
    -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encodedCommand) `
    -WorkingDirectory $RepoRoot `
    -PassThru
  Set-Content -LiteralPath $PidFile -Value $terminal.Id -Encoding ASCII

  Write-Host 'CN local demo is starting in a separate terminal.' -ForegroundColor Green
  Write-Host 'The database will be reset to the three protected default accounts with no class data.'
  Write-Host 'App: http://localhost:5173'
  Write-Host 'Studio: http://127.0.0.1:54323'
}

function Stop-CnDemo {
  $running = Get-TrackedProcess
  if ($running) {
    Write-Host "Stopping CN dev process tree (PID $($running.ProcessId))..." -ForegroundColor Cyan
    & taskkill.exe /PID $running.ProcessId /T /F *> $null
  } else {
    Write-Host 'No tracked CN dev terminal is running.' -ForegroundColor Yellow
  }

  if (Test-Path -LiteralPath $SupabaseCli) {
    Write-Host 'Stopping only the CN local Supabase containers (this may take up to a minute)...' -ForegroundColor Cyan
    Push-Location $RepoRoot
    $stopExitCode = 1
    $previousPreference = $ErrorActionPreference
    try {
      # Supabase emits a UTF-8 animated spinner. Windows PowerShell can decode
      # those frames as mojibake and print every frame on a separate line, so
      # keep the raw progress private and show stable messages instead.
      $ErrorActionPreference = 'SilentlyContinue'
      & $SupabaseCli stop --project-id $LocalProjectId --no-backup *> $null
      $stopExitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousPreference
      Pop-Location
    }
    if ($stopExitCode -ne 0) {
      throw "Could not stop the CN local Supabase containers (exit code $stopExitCode). Check that Docker Desktop is running, then try option 2 again."
    }
    Write-Host 'CN local Supabase containers and ephemeral data volumes stopped.' -ForegroundColor Green
  }

  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $RunnerFile -Force -ErrorAction SilentlyContinue
  Remove-StaleCnTempWorkdirs
  Write-Host 'CN local demo is stopped.' -ForegroundColor Green
}

function Stop-DockerDesktop {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return }
  if (Test-DockerReady) {
    Write-Host 'Stopping Docker Desktop; this also affects other local Docker projects.' -ForegroundColor Yellow
    & docker desktop stop | Out-Host
  }
}

function Show-Status {
  $running = Get-TrackedProcess
  $dockerReady = Test-DockerReady
  $containerCount = 0
  if ($dockerReady) {
    $containers = @(& docker ps --filter "name=$LocalProjectId" --format '{{.Names}}')
    $containerCount = @($containers | Where-Object { $_ }).Count
  }
  Write-Host "Docker Desktop: $(if ($dockerReady) { 'Running' } else { 'Stopped' })"
  Write-Host "CN dev terminal: $(if ($running) { "Running (PID $($running.ProcessId))" } else { 'Stopped' })"
  Write-Host "CN Supabase containers: $containerCount"
  if ($running) { Write-Host 'App: http://localhost:5173' }
}

if ($Action -eq 'Menu') {
  while ($true) {
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor DarkCyan
    Write-Host ' CN Demo - Local Development Tool' -ForegroundColor Cyan
    Write-Host '============================================================' -ForegroundColor DarkCyan
    Write-Host 'This tool uses only the isolated local Supabase database.'
    Write-Host ''
    Write-Host '1. START' -ForegroundColor Green
    Write-Host '   Clean stale CN temp files, start Docker Desktop when needed,'
    Write-Host '   reset the local database,'
    Write-Host '   and open the CN frontend, API, and private image Storage.'
    Write-Host '   Accounts: admin, testteacher, teststudent (password: password).'
    Write-Host ''
    Write-Host '2. STOP' -ForegroundColor Yellow
    Write-Host '   Stop the CN frontend, API, and CN Supabase containers.'
    Write-Host '   Delete their local database/Storage volumes and temp files.'
    Write-Host '   Docker Desktop stays open for your other local projects.'
    Write-Host ''
    Write-Host '3. STOP ALL' -ForegroundColor Red
    Write-Host '   Do everything in option 2, then stop Docker Desktop too.'
    Write-Host '   Warning: this can stop other local Docker projects.'
    Write-Host ''
    Write-Host '4. STATUS' -ForegroundColor Cyan
    Write-Host '   Show whether Docker, the CN dev terminal, and its local'
    Write-Host '   Supabase containers are currently running.'
    Write-Host ''
    Write-Host '0. EXIT'
    Write-Host '   Close this menu without starting or stopping anything.'
    Write-Host ''

    $choice = (Read-Host 'Choose 0, 1, 2, 3, or 4').Trim()
    $Action = switch ($choice) {
      '1' { 'Start' }
      '2' { 'Stop' }
      '3' { 'StopAll' }
      '4' { 'Status' }
      '0' { 'Exit' }
      default { 'Invalid' }
    }

    if ($Action -eq 'Invalid') {
      Write-Host "Invalid selection '$choice'. Please enter only 0, 1, 2, 3, or 4." -ForegroundColor Red
      continue
    }
    if ($Action -eq 'Exit') {
      Write-Host 'No changes made. Goodbye.' -ForegroundColor Cyan
      exit 0
    }
    break
  }
}

switch ($Action) {
  'Start' { Start-CnDemo }
  'Stop' { Stop-CnDemo }
  'StopAll' {
    Stop-CnDemo
    Stop-DockerDesktop
  }
  'Status' { Show-Status }
}
