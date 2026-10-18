# LOCALHOST-03 — Secure Session Recovery via Local Terminal (2026-10-18)

**Product:** ContentStudio / Video AI Flow is a browser Web App on localhost, not a Windows desktop program.

## Problem resolved
The SDK deliberately holds bearer/CSRF tokens only in RAM. A hard browser refresh discards them while the Fastify backend remains paired; the original pairing code can only be consumed once. Previously this required restarting the local server and all its workers to pair again.

Now the **local operator** can rotate sessions in the existing server terminal **without restarting Fastify, SQLite or SP-04 workers**. When the browser displays the pairing page after refresh, type `pair` into the **same interactive terminal that runs ContentStudio**. The terminal prints a **new one-time code**. Enter it on the web pairing page. The prior session's bearer/CSRF tokens are revoked. If the server was launched without an interactive terminal (CI, background process), the command is unavailable; restart the backend in an interactive terminal to pair again.

The `pair` command is **not an HTTP API** or a browser button. It cannot be invoked over the network. Credential values are never put into browser storage, URLs, log files, or GitHub artifacts. Every explicit rotation invalidates existing browser connections on this localhost instance; other tabs will also need re-pairing after refresh.

## Changed files
- `packages/security/src/session.mjs`: `rearmFromLocalOperator()` rotates a random pair code, revokes bearer/CSRF, resets five-attempt lockout. Credentials minted only after valid re-pair; old codes cannot be replayed.
- `apps/api/src/operator-console.mjs`: strict, side-effect-bounded local terminal dispatcher for `pair` and `help`; unknown input isn't echoed (could contain a secret).
- `apps/api/src/server.mjs`: subscribe to interactive stdin only when `listen===true && process.stdin.isTTY`, detach on close, never register any `/api/session/rearm` route.
- `apps/web/src/main.jsx`: recovery instructions on pairing page.
- `apps/api/test/security-r003.test.mjs`: rotation, stale bearer/CSRF, rate limit, replay attack, absent unauthenticated route.
- `apps/api/test/operator-console.test.mjs`: command parser, secret redaction, auth revocation.
- `tools/live-http-smoke.mjs`: actual Fastify re-pair with preserved SQLite data, old authorization revoked.
- `tools/localhost-browser-e2e.mjs`: real headless Chrome hard refresh → Pairing → operator-only rearm → re-pair → choose saved channel/video with 7 scenes → no AI/render jobs.

## Automated verification
GitHub PR #16 should validate native security regression, reviewed npm lock, actual Vite build, Fastify live HTTP, real Chromium with production UI on 127.0.0.1, and offline suite. `releaseStatus=NOT_READY` until true MP4, human A/V, local provider and long-form resilience/performance gates pass. Explicitly **not an auto-login feature**; intentionally requires human/operator action. Do not replace this with unsafe persisted tokens.

## Subsequent acceptance
1. Real 5-scene HyperFrames MP4 on a supported local host with pinned `hyperframes@0.8.159`, FFprobe H.264/AAC/SRT, human audio/glyph check.
2. Scene Cache hit/miss and 35–40 min 1080p render + interrupted worker restart (MP4 integrity).
3. Approved local Ollama/VieNeu-TTS/ComfyUI providers and CPU/RAM/GPU benchmarking.
