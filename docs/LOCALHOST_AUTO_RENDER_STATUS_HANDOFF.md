# LOCALHOST-06 — Automatic Render Status Recovery

**Project:** ContentStudio / Video AI Flow · Browser PWA on localhost with React/Vite, Fastify and SQLite/SP-04; NOT a native Windows app.

## User problem
LOCALHOST-05 proved real Chrome → HyperFrames MP4 → authenticated download, including seven cached scene segments on the second export. But the React Download control did not automatically show the finished MP4 during the first 8 seconds after the worker reported success; clicking **Cập nhật bản xuất** restored it. Browser session reload/hardware use should not require extra navigation for normal rendering.

## Code (PR #20)
- `apps/web/src/render-job-sync.mjs`: pure identity-checked status reconciliation. An older GET or SSE callback **cannot overwrite a newer explicit job**; terminal outputs cannot be regressed to queued/running.
- `apps/web/src/TimelineRenderWorkspace.jsx`: on mount and every 2.5 seconds while visible, read only the latest 10 sanitized per-video SP-04 SQLite history rows, and update whichever job the user actually selected. It also directly polls an active job, aborts after unmount/job switch, and polls on focus/visibility restoration.
- `apps/web/src/RenderDrawerR312.jsx`: same stale-job protection in SSE and fallback GET status callbacks.
- `apps/web/src/render-job-sync.test.mjs`: concurrency, immutable terminal state, history idempotency and UI effect checks.
- `tools/localhost-browser-e2e.mjs`: new `--require-auto-render-status` gate refuses to accept a manual history Refresh as success. The existing manual refresh remains available to users for resilience.
- `.github/workflows/local-hyperframes-proof.yml`: the full real Chrome + 7-scene HyperFrames cold/warm cache + authenticated MP4 download must pass this stricter automatic UI gate.

## Critical acceptance
Real hosted Linux browser, production React/Fastify/SQLite, operator-authenticated session, approved 7-scene Composition, committed local PNG/WAV test media: click Render twice, observe first 7 encodes then 7 cache hits, wait for **automatically enabled** MP4 Download button (no manual history refresh), and verify an authenticated `GET /mp4` with HTTP 200. Confirm full offline regression, production build, R2VID diagnostics and independent 5-scene H264/AAC/SRT golden test are also green **on the PR head SHA**.

## Restrictions
Never save bearer/CSRF in browser storage; never auto-dispatch jobs or cloud/paid providers. UI history reads are bounded 10 rows and local-only. A second explicit user click is required to rerender. This step does not certify local GPU inference, human Vietnamese subtitle/music review, worker crash recovery, or 35–40 minute 1080p performance. Product remains `NOT_READY`.

## How another agent continues
Review PR #20 and the four GitHub Actions checks associated with its latest head. If the strict automatic browser test fails, use the sanitized stage `E2E_RENDER_STATUS_AUTO_REFRESH_MISSING` and investigate render selection/mount/status reconciliation—do not weaken the gate to manual Refresh or create a synthetic MP4. Do not merge until required checks PASS. Update WORKLOG with the final run numbers and human QA/long-form tasks.
