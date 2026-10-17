# R2-EXT-03 handoff · 2026-10-15

**Read first:** `docs/R2EXT03_POC_GATE.md`, `docs/TEST_REPORT_R2EXT03.md`, `spikes/EXT-03/README-R2EXT03.md`, this file. Previous R2-EXT-02: `docs/R2EXT02_TIMING_CONTRACT.md`.

**Checkpoint:** R2 original 13/13 + EXT-01/02 code complete/tested offline (714/714 full). EXT-03 **benchmark harness implemented, engine comparison BLOCKED** because npm registry inaccessible. Do NOT silently elevate EXT-03 to complete or choose a renderer. User doesn't have Windows hardware to test yet.

**Files changed:** `spikes/EXT-03/` (reused earlier companion POC's PNG/WAV/manifest/FFmpeg baseline, two example render projects, new deterministic fixture generator/instrumented 3-workload×3-repeat POC/test), repo `package.json`, `docs/{R2EXT03_POC_GATE,TEST_REPORT_R2EXT03,R2EXT03_STATUS,HANDOFF_R2EXT03,WORKLOG,DECISIONS,HANDOFF,VIDEO_AI_FLOW_EXTENSION_BACKLOG}.md/json`, `AGENTS.md`, `R2_Status.md`, `README.md`. No API, SDK, schema, database or live engine changed.

**Reproduction:**

```text
npm run test:ext03
npm run poc:ext03:prepare
npm run test:ext02
npm run test:all
npm run check
npm run typecheck:sdk
npm run test:negative-control
```

On a network-enabled machine install `spikes/EXT-03/remotion` and `spikes/EXT-03/hyperframes` npm dependencies separately, then run `python spikes/EXT-03/scripts/benchmark-r2ext03.py --run --repeats 3`. Review per-run logs, output MP4s, FFprobe and human quality checks. If versions/API drift, patch generator+tests, never fabricate results. Confirm fonts/GPU parity and licensing. Link production choice to a dated proof, not prior FFmpeg standalone POC.

**Safety:** Old FFmpeg baseline and fabricated approximate `wordSlots` remain in historical source `manifest.json` only as fixture provenance; new generated workloads have **no wordSlots**. No paid remote calls, no secrets, no extra scheduler, no migration. EXT-02 manual-timing locks and v1/v2 contracts untouched.
