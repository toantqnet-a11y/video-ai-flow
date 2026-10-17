param(
    [ValidateSet('diagnose','test','speak')]
    [string]$Mode = 'diagnose'
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if ($Mode -eq 'diagnose') { node src/cli.js diagnose; exit $LASTEXITCODE }
if ($Mode -eq 'test') { npm test; exit $LASTEXITCODE }
if ($Mode -eq 'speak') {
    Write-Host 'Type a short Vietnamese sentence and press Enter:'
    $line = Read-Host
    $line | node src/cli.js synth --provider auto
    exit $LASTEXITCODE
}
