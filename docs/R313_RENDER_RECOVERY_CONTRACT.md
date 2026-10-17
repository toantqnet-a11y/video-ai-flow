# R3-13 — Render recovery, subprocess cancellation and disk safety

**Status:** CODE_COMPLETE_TESTED_OFFLINE. This is not a Windows/production acceptance certificate.

## Reliability model
1. **Disk admission:** `checkRenderDisk` uses `statfs.bavail × bsize`, never `bfree`. Required temporary capacity is a conservative function of Composition v2 duration, resolution, encoding overhead and (for HyperFrames) staged pinned media. The check is *an estimate*, not a final MP4 size forecast or guarantee. A further 512 MiB is reserved. If the filesystem cannot report capacity, fail closed. Preflight is read-only, reports sanitized capacity and refuses low disk. Job handler independently rechecks immediately before encoding; a formerly green preflight does not bypass this recheck.
2. **Process lifetime:** `runBinary` abort/timeout kills the POSIX process group (including child CLI workers); on Windows uses `taskkill /PID <numeric> /T /F`, without shell expansion. The worker propagates `AbortSignal` on lost lease; timeout/abort return distinct errors. No provider retry, surprise engine fallback, or paid API calls.
3. **Recovery:** The original SP-04 `recoverExpired`, heartbeat, attempt counter and lease-token fencing remain authoritative. An expired first lease can never commit after a second lease claims the same job. A retry reuses the same frozen render snapshot and verified FFmpeg segment SHA cache; a completed digest-addressed output is QA'd before being reused. This is not exactly-once execution of external processes; it is fenced once-only **DB completion**.
4. **Temp data:** Startup removes only UUID-named `.staging-*` / `.hyperframes-*` folders older than 24h, before starting workers. Symlinks, output MP4/SRT/JPEG and `.segment-cache` are preserved. If old dirs contain a still-live external process they must not be collected; use a single application instance and conservative age grace. `finally` always attempts cleanup after handled failures.
5. **Published outputs:** MP4 is published after FFprobe H.264/AAC dimensions/fps/frame count/duration QA. It is not marked as a successful job until the SRT and worker result are committed. Under a power failure after file rename but before DB completion, retry validates the existing output. Corrupt existing outputs fail closed instead of being silently reused.

## Known limitations
- Disk estimates are intentionally conservative but cannot predict encoder spikes, other-process disk activity or all OS quotas; `ENOSPC` is still possible mid-job. Error remains retryable only within the existing bounded SP-04 policy (maxAttempts=2 for local render).
- Cache/checkpoints are implemented for **FFmpeg scenes**, NOT individual HyperFrames scene encoding. HyperFrames currently re-renders whole composition after an interrupted run.
- Real OS process-tree kill on Windows and crash during a 30–40-minute HyperFrames render are NOT validated.
- The user-selected FFmpeg fallback is never triggered automatically.

## Focused tests
`npm run test:r313-r314` covers statfs low/unknown capacity, safe cleanup, abort/timeout, lease expiry, idempotent user click and stale worker fencing. `npm run test:r312` and `npm run test:ext040506` cover real short FFmpeg render/preflight. `npm run acceptance:r314` runs broader gates, including 300-scene planning and five-scene real FFmpeg MP4; blocked gates are explicit.
