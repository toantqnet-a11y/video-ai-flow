# FI-01 — Verification report · 2026-10-16

| Check | Observed evidence | Result |
|---|---|---|
| `npm run test:fi01` | 7/7 pure dependency/install/launcher tests | PASS |
| `npm run test:hyperframes` | 8/8 contract and mock render tests | PASS (not a real HyperFrames MP4) |
| `npm run test:all` | **852/852**, exit **0**, 0 failures/skips; TAP completion | PASS offline |
| `npm run check` | OpenAPI and Node syntax checks | PASS |
| `npm run typecheck:sdk` | TypeScript SDK | PASS |
| `npm run test:negative-control` | API security negative-control | PASS |
| `npm run audit:r408:verify` | 11 PASS / 13 BLOCKED / 0 FAIL | NOT_READY |
| `npm run acceptance:fi01:hyperframes` | Exit 1; `HYPERFRAMES_NOT_INSTALLED` | BLOCKED (real-only test was attempted) |
| `npm ping` | EAI_AGAIN registry.npmjs.org | BLOCKED: npm dependencies / lock generation |
| Browser / Windows / full pipeline 35 min | Not run on target hardware | BLOCKED |

Critical: **852/852** is the complete Node offline test suite, not the application release gate. Baseline last turn did not have a reliable full-suite result; the complete TAP and process exit are now captured. Live-render test correctly refuses FFmpeg/mocks as evidence.

Audit summary: `{"pass": 11, "blocked": 13, "fail": 0}`. Status `NOT_READY`; zero failures only means the executed offline validations passed, not that acceptance is complete.

Logs: `docs/evidence/FI01_full_test_summary.json`, `docs/evidence/R408_release_audit_verified.json`, `docs/evidence/FI01_real_hyperframes_finishing.json`.
