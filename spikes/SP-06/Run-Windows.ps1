# SP-06 portable security checks. Run inside extracted workspace in PowerShell.
param([ValidateSet('test','demo')][string]$Mode='test')
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
if ($Mode -eq 'test') { npm test } else { npm run demo }
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
