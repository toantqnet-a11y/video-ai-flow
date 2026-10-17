# R2-04 — Piper/VieNeu Custom Local HTTP Bridge Contract

ContentStudio does **not** assume Piper or VieNeu have identical native HTTP APIs. An operator must run a compatible HTTP bridge on **literal `127.0.0.1`**. No provider is registered merely because its name exists in a channel preset.

## Configuration

Windows PowerShell example (set **before** launching ContentStudio):

```powershell
$env:CONTENTSTUDIO_PIPER_TTS_URL = 'http://127.0.0.1:8111/synthesize'
$env:CONTENTSTUDIO_PIPER_TTS_VOICE = 'vi_VN_piper'
$env:CONTENTSTUDIO_PIPER_TTS_BODY_FORMAT = 'json'

$env:CONTENTSTUDIO_VIENEU_TTS_URL = 'http://127.0.0.1:8112/synthesize'
$env:CONTENTSTUDIO_VIENEU_TTS_VOICE = 'vi_VN_natural'
$env:CONTENTSTUDIO_VIENEU_TTS_BODY_FORMAT = 'json'
```

Each URL is optional. No URL means `not_configured`, no adapter and no local voice Job. Only `http://127.0.0.1:<port>/<path>` is accepted; **not** `localhost`, external hosts, HTTPS, query parameters, credentials or fragments. The server is responsible for starting the bridge and installing/loading its model; ContentStudio does not download models automatically.

## Custom JSON protocol (default)

`GET /health` — returns any HTTP 2xx if the local bridge considers itself ready. This is a reachability check, not proof of speech model quality.

`POST /synthesize` with headers `Content-Type: application/json`, `Accept: audio/*`. Body:

```json
{"text":"Xin chào các bạn.","voice":"vi_VN_piper","rate":0}
```

`rate` is an integer percent from -50 to +100 (`0` = default, `20` = 1.2× multiplier). Return **binary WAV or MP3** with appropriate `Content-Type: audio/wav` or `audio/mpeg`; do not return JSON with a file URL. If the native service accepts only plain text, set `CONTENTSTUDIO_PIPER_TTS_BODY_FORMAT=text` (or VieNeu equivalent); this sends `Content-Type: text/plain; charset=utf-8` and the text directly. Voice and rate are not carried by that plain-text protocol; the bridge/operator must establish those defaults.

The existing SP-02 adapter accepts WAV or MP3 **by inspecting actual binary signatures** and rejects JSON/HTML masquerading as audio. Requests have a 90-second timeout, a 12 MB output bound and `redirect: error`; invalid files are not committed. FFprobe verifies codec and duration before queue promotion. Runtime assets are kept inside the configured ContentStudio `data/` root and served only through authenticated APIs.

## UI & fallback

In **Video → Scenes → Voice TTS**, the UI lists configured `piper`/`vieneu` voices, alongside Edge (Hoài My/Nam Minh). Local primary synthesis needs no Internet consent. Edge synthesis requires the user to explicitly consent on the request. Choosing **Fallback local khi Edge lỗi** pins a single local fallback provider/voice to that particular job. The fallback happens only for retryable provider-unavailable, timeout, rate-limit, network or dependency errors; bad input, invalid policy, cancellations and unknown charging never trigger a fallback. A fallback provider is never used without this explicit selection.

Read-only `GET /api/tts/local-providers` gives configured voice IDs and `not_probed`. Add `?probe=true` to perform safe loopback `GET /health` calls and return `ready` or `unavailable`. Neither local URLs nor provider response text are returned.

## Manual acceptance to run on Windows

1. Start compatible local Piper/VieNeu bridge(es) manually; confirm `/health` and `/synthesize` return audio bytes independently.
2. Set only the desired `CONTENTSTUDIO_*_TTS_URL`, `...VOICE` and optional `...BODY_FORMAT` values; restart the API.
3. Select one local voice and generate a Vietnamese scene, listen to the output, and confirm the FFprobe duration and playback.
4. Force an Edge TTS failure: verify **without fallback enabled** no local synthesis occurs; then explicitly enable Piper/VieNeu fallback and verify the committed provider metadata changes to local.
5. Edit the scene during a slow TTS operation: verify the obsolete result cannot be promoted. Confirm restart recovery and memory/file usage under a 35-minute recording workload.

**None of these model/Windows/browser acceptance steps have been run in this offline environment.**
