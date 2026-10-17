param(
  [ValidateSet('test','diagnose','import','generate')][string]$Mode = 'diagnose',
  [string]$ImagePath = ''
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if ($Mode -eq 'test') { & npm test; exit $LASTEXITCODE }
if ($Mode -eq 'diagnose') { & node src/cli.js diagnose; exit $LASTEXITCODE }
if ($Mode -eq 'import') {
  if (-not $ImagePath) { throw 'Use -ImagePath C:\path\to\picture.png' }
  & node src/cli.js import $ImagePath
  exit $LASTEXITCODE
}
& node src/cli.js generate
exit $LASTEXITCODE
