param(
  [ValidateSet('diagnose','smoke','full','serve')][string]$Mode = 'diagnose'
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 22+ is required. Install Node.js and reopen PowerShell.' }
if ($Mode -eq 'diagnose') { node src/cli.js diagnose }
elseif ($Mode -eq 'smoke') { node src/cli.js benchmark --smoke }
elseif ($Mode -eq 'full') { node src/cli.js benchmark --full }
elseif ($Mode -eq 'serve') { node src/cli.js serve }
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
