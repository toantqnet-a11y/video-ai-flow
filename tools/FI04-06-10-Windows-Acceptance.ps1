# FI-04-06..10 staged, operator-initiated gates. Never perform paid/remote AI
# calls or auto-install packages. A failed strict gate stays failed.
[CmdletBinding()]
param(
 [ValidateSet('Inspect','Long','RecoverySmoke','LocalHandshake','Security','Final')][string]$Stage='Inspect',
 [string]$DataRoot='', [string]$VideoId='', [string]$SelectionFile='', [string]$RequestKey=''
)
$ErrorActionPreference='Stop'
if ($PSVersionTable.PSEdition -eq 'Core' -and -not $IsWindows) { throw 'FI0410_WINDOWS_ONLY' }
$root=Resolve-Path (Join-Path $PSScriptRoot '..')
Push-Location $root
try {
 switch($Stage) {
  'Inspect' {
   node tools/fi0406-long-render.mjs --inspect --report=docs/evidence/FI0406_long_render.json
   node tools/fi0408-provider-e2e.mjs --inspect --report=docs/evidence/FI0408_providers.json
   node tools/fi0409-security-performance.mjs --inspect --report=docs/evidence/FI0409_security.json
   node tools/fi0410-final-release.mjs --inspect --report=docs/evidence/FI0410_release.json
  }
  'Long' {
   if (!$DataRoot -or !$VideoId -or !$SelectionFile -or !$RequestKey) { throw 'FI0406_REAL_PROJECT_ARGS_REQUIRED' }
   # ONLY for consented/test project in approved Windows data root. 35-40 min
   # FULL-HD published immutable timeline with explicit subtitles and music.
   node tools/fi0406-long-render.mjs --run --confirm-local-render "--data-root=$DataRoot" "--video-id=$VideoId" "--selection-file=$SelectionFile" "--request-key=$RequestKey" --report=docs/evidence/FI0406_long_render.json
  }
  'RecoverySmoke' { node tools/fi0407-recovery.mjs --simulate --report=docs/evidence/FI0407_recovery.json }
  'LocalHandshake' { node tools/fi0408-provider-e2e.mjs --probe-local --report=docs/evidence/FI0408_providers.json }
  'Security' { node tools/fi0409-security-performance.mjs --verify --report=docs/evidence/FI0409_security.json }
  'Final' { node tools/fi0410-final-release.mjs --inspect --strict --report=docs/evidence/FI0410_release.json }
 }
 if ($LASTEXITCODE -ne 0) { throw "FI04_STAGE_NOT_READY: $Stage (see redacted docs/evidence report)" }
} finally { Pop-Location }
