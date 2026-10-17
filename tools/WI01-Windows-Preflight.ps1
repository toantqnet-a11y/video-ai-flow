<# WI-01: safe operator-only Windows readiness inspection. Does not install
 modules, launch paid AI, attach browser, or assert any production approval.
   .\tools\WI01-Windows-Preflight.ps1 -Inspect
   .\tools\WI01-Windows-Preflight.ps1 -Strict
 Check docs/evidence/WI01_windows_preflight.json for exact next actions.
#>
[CmdletBinding()]
param([switch]$Inspect,[switch]$Strict)
$ErrorActionPreference='Stop'
if((([int][bool]$Inspect)+([int][bool]$Strict)) -ne 1){throw 'WI01_SELECT_INSPECT_OR_STRICT'}
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $root
try {
 $argsToPass=@('tools/wi01-windows-preflight.mjs','--inspect','--report=docs/evidence/WI01_windows_preflight.json')
 if($Strict){$argsToPass+='--strict'}
 & node @argsToPass
 if($LASTEXITCODE -ne 0){throw 'WI01_PREREQUISITES_BLOCKED: see docs/evidence/WI01_windows_preflight.json'}
 Write-Host 'WI-01 inventory complete. PASS here never means application production ready.'
} finally {Pop-Location}
