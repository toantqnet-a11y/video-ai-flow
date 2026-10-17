# R3-12 Test Report · 2026-10-16

- `npm run test:r312`: **6/6 PASS**, including actual FFmpeg H.264/AAC 1280×720 output, SHA preflight/no queued jobs, immutable older output after timeline edit, SSE allowlist, 16:9/9:16/square geometry, scene-progress honesty.
- `npm run test:ext040506`: **15/15 PASS**, verified regression FFmpeg and contract.
- `npm run check`: **PASS**, OpenAPI types generated and in sync.
- `npm run typecheck:sdk`: **PASS**.
- `npm run test:negative-control`: **PASS**.
- JSX syntax parsed by TypeScript `createSourceFile` for new drawer and updated parent: **0 parse errors**.
- `npm run build:web`: **BLOCKED** `vite: not found` (installed dependencies absent).
- `npm run test:all`: **ATTEMPTED, NOT FULL PASS**. First completed run **810/811 PASS**, one legacy IA-01 test failed because preflight replaced the existing public `RENDER_ASSET_CHANGED` code with a generic code. Fixed preflight to preserve approved safe domain codes; reran affected `tools/integration-acceptance.test.mjs` **4/4 PASS**, and R3-12 **6/6 PASS**. Second full rerun was interrupted after test #201; **no new full green evidence**.
- `npm run test:live-http`, real HyperFrames MP4, Windows/Chrome interactive UI, 35-minute render: **NOT RUN**.

**Latest verified: 6/6 new, 15/15 EXT-04/06, 4/4 IA-01 after fix; global 811-test PASS is NOT established. Release NOT_READY.**
