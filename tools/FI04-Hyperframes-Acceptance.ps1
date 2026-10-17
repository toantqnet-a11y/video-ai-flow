<# FI-04-04 Windows *operator-only* real local renderer verification.
    Run only AFTER FI04-Windows-Setup.ps1 -ResolveLock, human review,
    committed package-lock, FI04-Windows-Setup.ps1 -Install and -Verify.
    Never installs npm packages, invokes cloud providers or changes the engine.
    .\tools\FI04-Hyperframes-Acceptance.ps1 -Inspect
    .\tools\FI04-Hyperframes-Acceptance.ps1 -Run
#>
[CmdletBinding()]
param([switch]$Inspect,[switch]$Run)
$ErrorActionPreference='Stop'
if((([int][bool]$Inspect) + ([int][bool]$Run)) -ne 1){throw 'FI04-04: specify exactly one of -Inspect or -Run'}
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if($Inspect){& node tools/fi04-hyperframes-acceptance.mjs --inspect --report=docs/evidence/FI0404_hyperframes_inspect.json}
else{& node tools/fi04-hyperframes-acceptance.mjs --run --save-review --strict --report=docs/evidence/FI0404_hyperframes_real.json}
if($LASTEXITCODE -ne 0){throw 'FI04-04 real proof BLOCKED or FAIL; no acceptance granted'}
if($Run){Write-Host 'Automated genuine HyperFrames clip checks passed. STILL REVIEW real Windows captions/voice/music manually; 35-minute and release gates remain BLOCKED.'}
