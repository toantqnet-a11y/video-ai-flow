# FI-02 · Production readiness & reproducible Windows bootstrap
Date: 2026-10-16 · Status: `NOT_READY`

## Objective and invariants

Continue from FI-01 (offline test suite 852/852 PASS in FI-01). **Do not** convert an offline mock, historical TAP log or FFmpeg MP4 into proof of production HyperFrames readiness. HyperFrames 0.8.159 remains primary; FFmpeg is explicit/manual only. No remote/premium provider calls, no second queue or migration.

## Changes

1. `tools/fi02-lock-policy.mjs` checks root exact HyperFrames pin **and** workspace package manifests, lock entries, and npm workspace links. The lockfile must be created/reviewed/committed online; this source artifact intentionally contains **no fabricated lockfile** (registry DNS is unavailable here).
2. `tools/launch.mjs` now refuses production startup with `PACKAGE_LOCK_UNVERIFIED` when no consistent committed lock exists, **even if** an unverified `node_modules` directory appears present. Missing dependencies with a valid lock can only be installed via `npm ci --no-audit --no-fund` — never floating `npm install`. `diagnose` prints `PACKAGE_LOCK_BLOCKED` clearly.
3. `tools/fi02-release.mjs` is the new machine-readable gate runner. `--verify-focused` actually executes FI-02 focused tests, OpenAPI check, TypeScript SDK and negative control. `--verify-offline` also runs the entire offline suite. `--verify-runtime` performs real Vite build, live Fastify HTTP and `npm audit`; `--verify-real-hyperframes` runs the genuine pinned queued subtitle/music render only if CLI and lock prerequisites are available. None of these steps silently installs or downloads a renderer.
4. `tools/FI02-Windows-Acceptance.ps1` is an explicit operator runbook: verify reviewed lock, `npm ci`, offline/runtime gates, optional real HyperFrames. The runner exits nonzero with `--strict` if *any* required gate is missing, including manual Windows usability / 35-minute render / long-job crash recovery / security review. This script has NOT been executed on Windows.
5. `tools/fi01-release-gates.mjs` restores a previously broken legacy command route (`acceptance:fi01`) by forwarding to FI-02's conservative inventory. This is a diagnostic alias, NOT FI-01 historical evidence.

## Windows bootstrap (operator, with npm connectivity)

From the extracted project root using Node >=22.13, npm, FFmpeg/FFprobe:

```powershell
# One-time, online developer step; inspect versions/license and commit lockfile:
npm install --package-lock-only --ignore-scripts
# Verify resolved node_modules/hyperframes = exactly 0.8.159 in package-lock.json
node --input-type=module -e 'import {verifyWorkspaceLock} from "./tools/fi02-lock-policy.mjs"; console.log(await verifyWorkspaceLock(process.cwd()))'

# After the reviewed lockfile is present:
.\tools\FI02-Windows-Acceptance.ps1 -WithRealHyperFrames
# Starts with npm ci, then runs focused/full offline, Vite, Fastify,
# npm audit and genuine pinned HyperFrames + captions + BGM (when available).
```

The power-shell script does **not** attest human visual/audio inspection. Separately perform and document: desktop browser UI drag/trim/preview/undo/reorder; multi-cue Vietnamese subtitle readability and music audibility; full 35-minute actual HyperFrames MP4 with exact frame count, codec and wall-clock/CPU/RAM/disk logs; interruption/restart/resume without corrupt output; real local AI providers with explicit consent; production security review. No manual gate is promoted automatically.

## Quick offline check (works without npm installs)

```bash
npm run test:fi02
npm run acceptance:fi02:focused
node tools/fi02-release.mjs --strict
node tools/launch.mjs diagnose
```

### Evidence integrity

A gate is `PASS` only after a command actually exits successfully **on this invocation**. `BLOCKED` is not an ignored failure. Reports do not persist child stdout, user paths, environment values, API keys or providers' responses. Tests check strict nonzero release denial. Missing package lock is **BLOCKED**; a deliberately mismatched lock is **FAIL**. Release status remains `NOT_READY` until real operator evidence is collected and reviewed.
