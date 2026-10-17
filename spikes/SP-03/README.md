# ContentStudio Sprint 0 — SP-03 GPU & Image Provider Spike

**Task:** SP-03 · EP06/EP09 · P0 · 2026-10-13  
**Status:** `TESTED (manual import and mocked provider protocols) / PENDING_GPU_REMOTE_WINDOWS_VALIDATION`. Not fully DONE.

## Goal and actual scope

Build a portable, maintainable **image asset pipeline** to support text-to-image in scene production. If local GPU/ComfyUI cannot be confirmed, the app must still import real image files, **never quietly switch to remote or billable providers**. This spike is *not* AI-video generation (SP-VID-01) or the durable queue (SP-04).

## Implemented modules

| File | Responsibility |
|---|---|
| `src/gpu.js` | Diagnose NVIDIA name/VRAM/driver from `nvidia-smi`, or names-only WMI fallback on Windows. No model capability claims. |
| `src/selector.js` | Explain eligible local/approved-remote/import path without bypassing per-request guard. |
| `src/comfy.js` | Real ComfyUI **self-hosted classic HTTP** API contract: exported API graph binding → `POST /prompt` → poll `/history/{id}` → `GET /view`; local-only origin, timeouts, cancellation and safe output naming. |
| `src/cloudflare.js` | Optional **metered remote** Workers AI model `@cf/black-forest-labs/flux-1-schnell`, secret from environment; disabled without explicit content-sharing consent and call-scoped estimated-cost approval. |
| `src/image.js` | PNG/JPEG/WebP signature, dimensions and ffprobe verification; output 25MB/40Mpx limits. |
| `src/service.js` | Provider routing, safe local import, failure classification, immutable scene image assets, SHA-256, atomic staging/metadata, version path and narrow structured events. |
| `src/validation.js` | Asset identity and loopback validation. |
| `src/cli.js`, `Run-Windows.ps1` | Reproducible smoke/diagnostic/desktop entry points. |
| `test/` | Protocol tests with local fake ComfyUI/Cloudflare transport (NOT AI generation); real PNG import and `ffprobe` decoder tests, auth/error/GPU tests. |

## Requirements

- Node 22+, ffprobe and ffmpeg installed (FFmpeg 7 works in Linux tests), **zero external npm dependencies**.
- For ComfyUI: a running ComfyUI local instance on `http://127.0.0.1:8188`, appropriate model weights and an **exported API-format workflow**. The sample test graph in tests is not an operational generative workflow; it intentionally has no checkpoint.
- For Cloudflare: account ID, API token, an approved cost estimate and explicit remote-sharing consent. **Free-tier availability, quota and pricing are not assumed.** Real provider has not been called; its contract is represented from provider documentation.
- For import: any actual local PNG/JPEG/WebP within the limits. No GPU or AI API required.

## Windows commands

```powershell
cd SP-03
.\Run-Windows.ps1 -Mode test
.\Run-Windows.ps1 -Mode diagnose
.\Run-Windows.ps1 -Mode import -ImagePath "C:\Images\my-photo.png"
```

### ComfyUI generation (when a machine/server is ready)

1. Open ComfyUI and export **API JSON** (not frontend workflow with UI positions).
2. Identify the input nodes for positive prompt and optionally seed/width/height. Do not guess node IDs across custom workflows.
3. Use environment variables to bind precisely those inputs:

```powershell
$env:COMFY_ENDPOINT = 'http://127.0.0.1:8188'
$env:COMFY_WORKFLOW = 'C:\MyWorkflows\txt2img_api.json'
$env:COMFY_BINDINGS = '{"prompt":{"nodeId":"6","input":"text"},"seed":{"nodeId":"3","input":"seed"}}'
$env:IMAGE_PROMPT_FILE = 'C:\MyWorkflows\prompt.txt'
.\Run-Windows.ps1 -Mode generate
```

Replace `6/3` above with node IDs of **your workflow**. A missing model or invalid graph is a provider configuration error, not a success. For remote Cloudflare, consult `src/cli.js` (`IMAGE_PROVIDER=cloudflare`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `IMAGE_REMOTE_CONSENT=YES`, `IMAGE_APPROVE_METERED=YES`, `IMAGE_ESTIMATED_USD`, `IMAGE_MAX_USD`). Never set these without understanding potential charges and privacy transfer.

## Validation summary (Linux development environment)

- `npm test`: **35/35 passed** (see `reports/test-results.txt`). Of these, real local PNG bytes were verified by `ffprobe` + full FFmpeg decode and persisted by `importImage`; ComfyUI and Cloudflare API flows are **mocked**.
- `node src/cli.js diagnose`: no GPU confirmed, local ComfyUI unreachable; preferred available path **manual import** (see `reports/diagnostics.json`).
- `node src/cli.js import fixtures/sp03-demo.png`: **real local file imported** into immutable asset; integrity and metadata checked. Source is a generated vector-like color-pattern fixture, **not AI output**.
- Regression: SP-02 `22/22` pass; SP-01 `4/4` pass.

## Limitations and handoff

- No Windows machine, GPU, CUDA drivers, running ComfyUI, model weights, Cloudflare credentials or authorized quota; **no actual generated AI image has been verified**.
- `ImageService` does not use SQLite, queues, cost approvals ledger or shared scenes DB. SP-04 implements durable queue/fencing; R2 persists assets in database and handles race/fallback authorization.
- Full decode on every output beyond ffprobe container/dimension verification and image normalization/crop are future work in R2-05/R2-06. No actual latency or provider quota figures measured.
- ComfyUI job may remain running server-side after client cancellation; an interrupt or specific queue delete API must be added to coordinate cancellation in EP12.
- No hidden automatic remote fallback or paid switching. UI must show approval prompt in R0/R2 before any paid submission.

**Next task:** SP-04 — SQLite durable job scheduling/recovery spike. For Windows-specific GPU/ComfyUI verification later, run the commands above and attach results to the task evidence.
