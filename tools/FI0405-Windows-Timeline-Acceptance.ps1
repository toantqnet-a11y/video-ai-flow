# FI-04-05: on a Windows PC WITH the reviewed lock and npm ci, start API + Vite
# in separate terminals, pair in a dedicated Chrome/Edge test profile, open a
# seeded video Timeline, and enable CDP with a local-only debugging port.
# Never attach CDP to a normal browser profile containing personal sessions.
param([switch]$Inspect,[string]$Port='9222')
$ErrorActionPreference='Stop'
if (-not $IsWindows -and $PSVersionTable.PSEdition -eq 'Core') { throw 'FI0405_WINDOWS_ONLY' }
$root=Resolve-Path (Join-Path $PSScriptRoot '..')
Push-Location $root
try {
 if ($Inspect) { node tools/fi0405-browser-acceptance.mjs --inspect }
 else {
  Write-Host 'Prerequisites: approved package-lock + npm ci; running local API and Vite; a paired, seeded test Timeline in a dedicated Edge/Chrome remote debugging profile.'
  Write-Host "Edge example (separate test profile): msedge --user-data-dir=`"`$env:TEMP\cs-fi0405-browser`" --remote-debugging-port=$Port http://127.0.0.1:5173"
  Write-Host 'Operator must manually test mouse drag, trim save/cancel, Undo/Redo persistence, waveform/audio, zoom and 500 scenes on Windows.'
  node tools/fi0405-browser-acceptance.mjs --run "--endpoint=http://127.0.0.1:$Port" --report=docs/evidence/FI0405_windows_ui.json
  if ($LASTEXITCODE -ne 0) { throw 'FI0405_NOT_READY: automated evidence incomplete; manual visual/functional gates remain mandatory.' }
 }
} finally { Pop-Location }
