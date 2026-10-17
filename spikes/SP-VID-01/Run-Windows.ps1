# Convenience wrapper only; actual Windows GPU tests remain unverified.
param([ValidateSet('test','diagnose','help')][string]$Mode='diagnose')
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
if ($Mode -eq 'test') { node --test --test-concurrency=1 test/*.test.mjs }
else {node src/cli.mjs $Mode}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
