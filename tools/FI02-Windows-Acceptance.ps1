<# FI-02 operator-side acceptance for Windows, NEVER a claim of remote execution.
Requires a previously reviewed package-lock.json. Refuses `npm install`
resolution or npm/npx auto-install, and never contacts paid model APIs.
The operator must still inspect UI, 35-min media and restart separately.
#>
param([switch]$WithRealHyperFrames)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
if (-not (Test-Path (Join-Path $root 'package-lock.json'))) {
  Write-Error 'FI02_BLOCKED_PACKAGE_LOCK: generate/review/commit lockfile on a networked developer PC first.'
  exit 2
}
if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error 'FI02_BLOCKED_NODE_NPM'
  exit 2
}
# Verify declared pin and resolved package version *before* installing any package.
& node --input-type=module -e 'import {verifyWorkspaceLock} from "./tools/fi02-lock-policy.mjs";const r=await verifyWorkspaceLock(process.cwd());if(r.status!=="PASS")process.exit(2)'
if ($LASTEXITCODE -ne 0) { Write-Error 'FI02_BLOCKED_LOCK_INCONSISTENT';exit 2 }
& npm ci --no-fund --no-audit
if ($LASTEXITCODE -ne 0) { Write-Error 'FI02_DEPENDENCY_INSTALL_FAILED';exit 1 }
# Build and live HTTP are real processes. WithRealHyperFrames opt-in uses
# only the verified local CLI plus FFmpeg postmix, never mocks or substitutes.
$argsList=@('--verify-offline','--verify-runtime','--strict','--report=docs/evidence/FI02_windows_release.json')
if ($WithRealHyperFrames) { $argsList+='--verify-real-hyperframes' }
& node (Join-Path $root 'tools/fi02-release.mjs') @argsList
exit $LASTEXITCODE
