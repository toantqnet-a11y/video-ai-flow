<#
 FI-03 Windows deployment runbook (operator-triggered, no automatic cloud AI calls).
 Uses three SEPARATE explicit phases to prevent resolving dependencies and
 installing unreviewed packages in the same operation.

  .\tools\FI03-Windows-Setup.ps1 -ResolveLock      # networked PC only
  # Review package-lock.json and npm audit findings; commit lock to Git.
  .\tools\FI03-Windows-Setup.ps1 -Install          # uses immutable npm ci
  .\tools\FI03-Windows-Setup.ps1 -Verify           # unit, web, HTTP, real CLI
 # Browser/35-minute Windows restart testing remains manual acceptance.
#>
[CmdletBinding()]
param([switch]$ResolveLock,[switch]$Install,[switch]$Verify)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$selected=@($ResolveLock,$Install,$Verify) | Where-Object { $_ } | Measure-Object | Select-Object -ExpandProperty Count
if ($selected -ne 1) { throw 'Select exactly ONE explicit phase: -ResolveLock, -Install, or -Verify' }
function Invoke-Checked([string]$file,[string[]]$argv) {
  & $file @argv
  if($LASTEXITCODE -ne 0){throw "$file failed (exit $LASTEXITCODE); inspect terminal for first error"}
}
Invoke-Checked 'node' @('--version')
Invoke-Checked 'npm' @('--version')
$majorMinor=& node -p 'process.versions.node.split(".").slice(0,2).join(".")'
$pieces=$majorMinor.Split('.')
if([int]$pieces[0] -lt 22 -or ([int]$pieces[0] -eq 22 -and [int]$pieces[1] -lt 13)){
  throw 'Node >=22.13 is required'
}
if($ResolveLock){
  if(Test-Path 'package-lock.json'){throw 'Existing package-lock.json: review rather than silently replacing it'}
  # Networked machine resolves registry metadata, but NO package install occurs.
  Invoke-Checked 'npm' @('install','--package-lock-only','--ignore-scripts','--no-fund','--no-audit')
  Invoke-Checked 'node' @('--input-type=module','-e',
   'import {verifyWorkspaceLock} from "./tools/fi02-lock-policy.mjs";const s=await verifyWorkspaceLock(process.cwd());console.log(s);if(s.status!=="PASS")process.exit(2)')
  Write-Host 'LOCK CREATED. Inspect npm dependency tree, audit and diffs; COMMIT the lockfile before -Install.'
  exit 0
}
if(!(Test-Path 'package-lock.json')){throw 'Missing reviewed package-lock.json. Use -ResolveLock on a networked machine first.'}
Invoke-Checked 'node' @('--input-type=module','-e',
 'import {verifyWorkspaceLock} from "./tools/fi02-lock-policy.mjs";const s=await verifyWorkspaceLock(process.cwd());console.log(s);if(s.status!=="PASS")process.exit(2)')
if($Install){
  Invoke-Checked 'npm' @('ci','--no-fund','--no-audit')
  Invoke-Checked 'node' @('--input-type=module','-e',
   'import {findHyperframesCli} from "./packages/core/src/render-hyperframes.mjs";const x=await findHyperframesCli();console.log("Pinned local HyperFrames "+x.version)')
  Write-Host 'Installed pinned packages. Proceed with -Verify; NO automatic FFmpeg fallback.'
  exit 0
}
# Verification intentionally fails if a binary is absent or a test/build fails.
Invoke-Checked 'ffmpeg' @('-version')
Invoke-Checked 'ffprobe' @('-version')
Invoke-Checked 'npm' @('run','check')
Invoke-Checked 'npm' @('run','typecheck:sdk')
Invoke-Checked 'npm' @('run','test:negative-control')
Invoke-Checked 'npm' @('run','test:all')
Invoke-Checked 'npm' @('run','build:web')
Invoke-Checked 'npm' @('run','test:live-http')
Invoke-Checked 'npm' @('run','acceptance:fi01:hyperframes')
# npm audit is networked and MUST not quietly get suppressed or mark safe.
Invoke-Checked 'npm' @('audit','--audit-level=high')
Write-Host 'AUTOMATED WINDOWS CHECKS PASS. Perform real browser/35min/restart/operator checks before release.'
