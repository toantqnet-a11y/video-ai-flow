# R2-02: Scene Visual Prompts — Quick Start

**Goal:** Suggest consistent per-scene image/video prompts from a human-approved script. Only Ollama local is supported at this stage. No image/video generation, payment, or remote provider calls are added.

## Entry points
- UI: `Video → Scenes → AI Visual Prompts` (in Scene Builder).
- Choose a registered active local Ollama LLM. Save the scene plan before generating.
- Choose `Prompt trang này` or `Prompt toàn video` to enqueue missing prompts.
- Wait for `succeeded`; review per-scene prompt cards. `Đưa vào prompt trống` fills only empty fields locally. Click `Lưu Scene & Phiên bản` explicitly to commit.
- `import_video` scenes are excluded; suggested `ai_video` needs provider preflight before any future video generation.

## API
- `POST /api/videos/{id}/scenes/visual-prompts/generate`
  body: `{"sceneRevision":1,"videoRowVersion":3,"modelId":"<registered UUID>","requestKey":"<new-id>","indices":[0,1,2]}`
  (indices optional → all supported scenes; imported-video scenes are automatically skipped).
- `GET /api/videos/{id}/scenes/visual-prompts/runs`
- `GET /api/videos/{id}/scenes/visual-prompts/runs/{runId}`

## Agent handoff
- Start at `docs/HANDOFF.md`. Open `docs/TEST_REPORT_R202.md` for evidence.
- `npm run test:r202`, `npm run test:all`, `npm run check`, `npm run typecheck:sdk`.
- Historical migrations v1–19 were not rewritten. v20 only appended the immutable run-snapshot table.

## Deferred validation
Actual Ollama model calls, FFmpeg asset creation, React/Fastify runtime, Windows, GPU. Do not interpret mock results as AI images/video.
