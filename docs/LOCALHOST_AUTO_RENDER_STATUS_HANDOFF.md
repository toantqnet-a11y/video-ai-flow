> **LOCALHOST-06 DONE — verified 2026-10-19 on PR #20 (merged as `5549c0b4452cd07c36db372b6b0d563fa6df8cb3`).** Full CI [39277121225](https://github.com/toantqnet-a11y/video-ai-flow/actions/runs/39277121225) PASS; authenticated Chrome UI [39277121239](https://github.com/toantqnet-a11y/video-ai-flow/actions/runs/39277121239) PASS; focused R2VID [39277121194](https://github.com/toantqnet-a11y/video-ai-flow/actions/runs/39277121194) PASS; **real HyperFrames browser fixture** [39277121185](https://github.com/toantqnet-a11y/video-ai-flow/actions/runs/39277121185) PASS. Strict browser stage `mp4_download_auto_status` proves automatic MP4 availability **without clicking history Refresh**; 7 cold encodes then 7 true cache hits/0 re-encodes, HTTP 200 authenticated download, 2,039,107-byte H.264/AAC MP4, QA PASS, SHA256 `8718d04fdaf201d97a82eec16819b7910f41c5044746a2f286ca105464aa0da0`. Test PNG/WAV only, no real neural TTS/ComfyUI. Overall app **NOT_READY** for human A/V, long 35–40min encode and worker crash recovery.

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
