param(
    [ValidateSet('Test','Demo','Status')][string]$Mode = 'Test',
    [string]$Database = '.\data\queue.sqlite'
)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node 22.13+ is required' }
if ($Mode -eq 'Test') { npm test; exit $LASTEXITCODE }
if ($Mode -eq 'Demo') { node .\src\cli.js demo $Database; exit $LASTEXITCODE }
node .\src\cli.js status $Database
exit $LASTEXITCODE
