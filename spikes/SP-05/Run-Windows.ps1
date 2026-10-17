# Runs the SP-05 offline UI preview; Node.js 22+ only, no npm install required.
param([ValidateSet('preview','test')][string]$Mode='preview')
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if ($Mode -eq 'test') { node --test test/engine.test.mjs }
else { node src/server.mjs }
