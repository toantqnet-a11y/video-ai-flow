<# WI-02 reviewed explicit Windows phases (exactly one switch).
  -Inspect: local status only. -ResolveLock: npm package-lock metadata only.
  -Install: npm ci with pre-reviewed lock. -Verify: build and live loopback
  TCP Fastify + same-origin production UI, then graceful close.
  None of these steps approves browser UX, HyperFrames media or release.
#>
[CmdletBinding()]
param([switch]$Inspect,[switch]$ResolveLock,[switch]$Install,[switch]$Verify)
$ErrorActionPreference='Stop'
$flags=@($Inspect,$ResolveLock,$Install,$Verify)
if((@($flags | Where-Object {$_}).Count) -ne 1){throw 'WI02_EXACTLY_ONE_PHASE_REQUIRED'}
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $root
try {
 if($Inspect){
  & node tools/wi02-runtime.mjs --inspect --report=docs/evidence/WI02_windows_runtime.json
 } elseif($ResolveLock){
  & (Join-Path $PSScriptRoot 'FI04-Windows-Setup.ps1') -ResolveLock
 } elseif($Install){
  & (Join-Path $PSScriptRoot 'FI04-Windows-Setup.ps1') -Install
 } elseif($Verify){
  & node tools/wi02-runtime.mjs --run --strict --report=docs/evidence/WI02_windows_runtime.json
 }
 if($LASTEXITCODE -ne 0){throw 'WI02_PHASE_FAILED: inspect preflight evidence and console diagnostics'}
 Write-Host 'WI-02 phase complete. Browser, HyperFrames video and release gates remain separate.'
} finally {Pop-Location}
