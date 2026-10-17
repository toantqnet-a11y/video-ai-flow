# R2-09 — Test Report

Date: 2026-10-15 | Environment: Linux, Node v22.16.0, local SQLite.

| Gate | Measured result |
|---|---|
| `npm run test:r209` | **11/11 PASS** (core pagination, isolation, bad input, integrity and plans; HTTP ingress/contracts; view helpers) |
| `npm run test:all` | **624/624 PASS** (613 previous + 11 new) |
| `npm run check` | **PASS** (includes generated OpenAPI/TS deterministic drift check) |
| `npm run typecheck:sdk` | **PASS** |
| `npm run test:negative-control` | **PASS** (deliberate failure detected) |
| TypeScript JSX parse (main.jsx + AssetLibraryWorkspace.jsx) | **0 diagnostics** |
| `npm run build:web` | **BLOCKED** (`vite: not found`, exit 127). Do not claim browser build. |

Evidence retained in `docs/evidence/R209_{focused,test_all,check,typecheck,negative_control,web_build}.log`.

Safety invariants inspected/tested: asset read-only browsing does not touch queue, no cross-video cursor reuse, no prompt or filesystem path in listing, physical checksum detects corruption without clearing pointer, manual-pinned image recompute remains preserved, no remote/paid request issued, false cursor/input rejected. Historical migration suite remained unmodified; adding a v27 index was intentionally *not* shipped to preserve current migration-test compatibility.

Remaining acceptance: install project dependencies and build Vite, test authenticated Fastify/React in real browser, Windows path/symlink edge cases, large-media benchmark 30–40 minutes, real provider assets, and end-to-end retry/selection concurrency on device.
