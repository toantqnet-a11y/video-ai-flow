<#
R0-01: single entry point for a non-technical Windows user.
All real lifecycle logic lives in dependency-free tools/launch.mjs so Linux/Windows
can share tests and no secret-bearing settings are passed through shell commands.
#>
param(
  [ValidateSet('start','test','diagnose','api','web')][string]$Mode='start',
  [switch]$SkipInstall,
  [switch]$SkipBuild,
  [switch]$NoBrowser
)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error 'Node.js 22.13+ is required. Install Node.js 22 LTS, then retry.'
  exit 1
}
if ($Mode -ne 'diagnose' -and -not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error 'npm is required. Reinstall the official Node.js 22 LTS distribution including npm.'
  exit 1
}
# Keep the old developer modes for backwards compatibility; production start
# serves both UI and API at one loopback URL and requires only this command.
if ($Mode -in @('api','web')) {
  if ($SkipInstall -or $SkipBuild -or $NoBrowser) { Write-Error 'These flags only apply to -Mode start.'; exit 2 }
  if ($Mode -eq 'api') { & npm run dev:api } else { & npm run dev:web }
  exit $LASTEXITCODE
}
$argsList=@($Mode)
if ($SkipInstall) { $argsList+='--skip-install' }
if ($SkipBuild) { $argsList+='--skip-build' }
if ($NoBrowser) { $argsList+='--no-browser' }
& node (Join-Path $PSScriptRoot 'tools/launch.mjs') @argsList
exit $LASTEXITCODE
