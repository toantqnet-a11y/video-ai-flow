# R2-05 · Scene Image / ComfyUI Local Contract

**Status 2026-10-15:** offline code/adapter contract tested. Live ComfyUI model, GPU, Windows and browser acceptance remain unverified. No image-generation model weights are bundled. There is NO paid or remote image adapter enabled here.

## Operator setup (not auto-installed)

1. Install/launch ComfyUI separately on the **same computer**, listen on literal `http://127.0.0.1:8188`; install your preferred image checkpoint and custom nodes, if required by the workflow. For troubleshooting, ensure the `GET /system_stats`, `POST /prompt`, `GET /history/:prompt_id`, `GET /view` APIs exist. This is a ComfyUI-side prerequisite, not a promise the model will generate.
2. Export a real working image workflow in **ComfyUI API JSON** format to a trusted local file. Configure bindings to existing input nodes/fields so the adapter may supply a prompt, seed, width and height. Your node IDs are workflow-specific.
3. Set `CONTENTSTUDIO_COMFY_URL=http://127.0.0.1:8188`, `CONTENTSTUDIO_IMAGE_WORKFLOW=<absolute path to API JSON workflow>` and `CONTENTSTUDIO_IMAGE_BINDINGS_JSON={"prompt":{"nodeId":"6","input":"text"},"seed":{"nodeId":"3","input":"seed"},"width":{"nodeId":"5","input":"width"},"height":{"nodeId":"5","input":"height"}}` (placeholder IDs **must be replaced with your actual nodes**). Check the generated prompt/workflow via ComfyUI; the file need not match any pictured design.
4. Install Node 22.13+, FFmpeg/FFprobe, and repo npm dependencies on the target machine. Start the app; pair the local session. Go to **Scenes → ③ Hình ảnh**, select a saved `image_motion` scene with a committed visual prompt, then explicitly click **Tạo ảnh**. Click **Kiểm tra kết nối** to probe local API reachability; this does not verify a model, checkpoint, GPU memory or generation result.

## UI and API

- `GET /api/images/local-provider?probe=true|false`: configured/reachable **status only**, no local address or workflow content returned; `probe` is optional.
- `POST /api/scenes/:id/image/jobs`: JSON `{"style":"optional","seed":1,"width":1024,"height":576}`. **No** client-supplied prompt, model URL, filesystem path, or `remoteConsent`. Prompt comes from the saved scene. Needs operator-configured workflow, appropriate scene media type, local ComfyUI only. Returns 202 with queue job ID or cached selection.
- `GET /api/scenes/:id/image/status`: last job summary and currently valid selected asset. An older generated image is explicitly marked stale when its source/context is superseded.
- `POST /api/scenes/:id/image/import`: `{"mimeType":"image/png","dataBase64":"..."}` (`image/jpeg`, `image/webp` accepted); max **512 KiB decoded bytes**. Validates MIME/signature and FFmpeg decode, writes immutable `manual_import` revision, and selects it. Large image upload is deferred.
- `POST /api/scenes/:id/image/select`: `{"assetId":"<existing image revision of this scene>","expectedRowVersion":N}`. Explicitly selects an older or imported revision and invalidates outstanding generation intent. Cross-scene revision references are rejected.
- `GET /api/scenes/:id/image/file`: protected binary image preview, no-store; SDK `getSceneImageFile(id)` fetches using bearer stored in memory, verifies image signature/MIME, streams up to 25 MiB and constructs a revocable Blob URL. Never use public `<img src="/api/…">` endpoints.
- Older generic `POST /api/scenes/:id/assets/jobs` with `kind=image` is blocked with `USE_SCENE_IMAGE_JOBS` to prevent bypassing the source/config/workflow fence.

All API writes require existing session bearer/CSRF/Origin/Host gates. ComfyUI adapter restricts destination to literal loopback and does **not** follow redirects to external hosts. Request timing and poll/retry governed by SP-03/04 timeouts. No silent cloud fallback.

## Persistence / staleness / data costs

- New SQLite **v23** additive migration: `scene_image_intents` (one authoritative job per scene) and `scene_image_manual_selections`. It backfills preexisting *selected* committed `manual_import` image pointers. Existing old generated images without a pinned R2-05 intent are not automatically activated.
- `inputHash` binds scene text, saved visual prompt, media type, video config revision, ComfyUI exported workflow fingerprint, seed, style and dimensions. Same snapshot reuses the existing SP-04 job/cache; changing any bound input creates a new job.
- Workers check job/scene/config/current-workflow before calling ComfyUI and after result. Promotion checks again **inside a SQLite write transaction** before changing active asset. Late jobs can't overwrite a manual selection or a changed prompt. Actual PNG/JPEG/WebP bytes (not text pretending to be an image) are inspected and decoded via FFmpeg in the SP-03 image service.
- Successful jobs yield separate **immutable image versions**. Files and checksums remain on local disk. The scene pointer only changes after checks. No prompt text, tokens or Comfy endpoint are surfaced in API status.
- Incomplete orphan cleanup, full general-purpose media cache, large media imports and optimized cross-media deduplication belong to **R2-06/R2-09**. Running a ComfyUI checkpoint can consume GPU/RAM/electricity even if API fees are zero.

## Acceptance gate

Mock local HTTP ComfyUI + real decode/FFprobe tests pass offline. **Before production** verify a real checkpoint-generated image, API workflow binding, 30–40-minute project across many scenes, Windows, browser UI, cancellation/lease restart, visual quality/copyright/licensing and actual local hardware/operating costs. Never label a reachable `/system_stats` server as a successful model run.
