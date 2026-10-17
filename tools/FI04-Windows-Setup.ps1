<#
 FI-04 Windows operator checklist. Run on a trusted network with Node >=22.13.
 Exactly ONE phase each invocation. Never auto-resolve lock while installing.
 No paid/cloud provider calls. Browser/HyperFrames long job still need manual QA.
    .\tools\FI04-Windows-Setup.ps1 -ResolveLock
    # Inspect package-lock, licenses/integrity and commit it.
    .\tools\FI04-Windows-Setup.ps1 -Install
    .\tools\FI04-Windows-Setup.ps1 -Verify
#>
[CmdletBinding()]
param([switch]$ResolveLock,[switch]$Install,[switch]$Verify)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$selected=@($ResolveLock,$Install,$Verify) | Where-Object { $_ } | Measure-Object | Select-Object -ExpandProperty Count
if($selected -ne 1){throw 'FI04: choose exactly one of -ResolveLock, -Install, -Verify'}
if($ResolveLock){& (Join-Path $PSScriptRoot 'FI03-Windows-Setup.ps1') -ResolveLock; if($LASTEXITCODE -ne 0){throw 'FI04 lock resolution failed'};exit 0}
if($Install){& (Join-Path $PSScriptRoot 'FI03-Windows-Setup.ps1') -Install; if($LASTEXITCODE -ne 0){throw 'FI04 npm ci failed'};exit 0}
# Existing FI03 verification covers real  npm ci dependencies, full tests,
# Vite, Fastify, HyperFrames and audit; FI04 adds strict drift/build evidence.
& (Join-Path $PSScriptRoot 'FI03-Windows-Setup.ps1') -Verify
if($LASTEXITCODE -ne 0){throw 'FI04 prior real runtime gates failed'}
& npm.cmd run test:fi04
if($LASTEXITCODE -ne 0){throw 'FI04 focused regressions failed'}
& npm.cmd run backlog:check:fi04
if($LASTEXITCODE -ne 0){throw 'FI04 backlog drift'}
& npm.cmd run acceptance:fi04:verify
if($LASTEXITCODE -ne 0){throw 'FI04 runtime not verified'}
Write-Host 'FI04 machine checks complete. Still require interactive Windows UX + real 35-minute HyperFrames/recovery/provider/security acceptance.'
