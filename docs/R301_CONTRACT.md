# R3-01 · Scene Mutation & Inspector Contract

**Scope:** A per-scene explicit editor, impact preview, optimistic PATCH, and no automatic AI spend. Continues IA-02 with HyperFrames primary; all production acceptance gates remain open.

## API (both authenticated, single-scene)

- `POST /api/scenes/:id/impacts` accepts `{expectedRowVersion, patch, acknowledgeTextEdit?}`. No SQLite writes, network calls, provider dispatch or job enqueue. Returns `{scene, impact, changed, requiresAcknowledgement}`.
- `PATCH /api/scenes/:id` with identical body, after explicit preview and user acknowledgement for changed text. Returns `{scene, impact, changed}`.
- Allowlist patch keys `text`, `visualPrompt`, `mediaType`, `durationMs`. Reject empty patch, unknown provider/credential/cost keys, illegal media, invalid Unicode-empty text and durations outside 500–120000ms. `expectedRowVersion` is mandatory; stale draft returns 409 `SCENE_ROW_VERSION_CONFLICT`.
- Saving is one SQLite transaction. No-op does not increment rowVersion; successful mutation increments exactly once. `domain_events` audit includes changed field names and hashes of text, **not script content**. Previously published immutable assets/revisions are never deleted.

## Impact rules

| Changed field | Voice pointer | Generated image | Manual pinned image | Composition/Render |
|---|---|---|---|---|
| visualPrompt | keep | retire | preserve if media stays image | stale |
| text | retire + intent | retire + intent | preserve if media stays image | stale, captions stale |
| mediaType | keep | retire | detach if leaving image | stale |
| durationMs only | keep | keep | keep | stale timing |

`scene_image_intents` and `scene_voice_intents` are removed **only** when their source dependencies change. Old pending queue jobs can finish but cannot promote against deleted/replaced intent. No new jobs are created by editing. A previously selected manual image remains immutable; switching to video detaches the incompatible active image and selection but preserves the historical revision. The next explicit regeneration is the user/provider's responsibility.

## Frontend

`Timeline & MP4 → Scene Inspector`. Explicit preview and save, unsaved-draft guard on scene switching/reload, `beforeunload` guard, visible 409 conflict without overwriting the draft, text edit acknowledgement, and refresh after save. The existing Motion & Brand control is retained for effects; voice revision selection remains in Voice/Assets. A saved edit clears prior composition approval in the active tab, and saved render revisions are already checked by `checkPublishedSource` on enqueue and after encoding.

## Limitations

No R3-02 virtualized four-track editor, no word-level subtitle alignment, and no live Windows/React/Fastify/HyperFrames render acceptance. IA-02 release state remains `NOT_READY`. Scene edits after an approved Master Script are intentional deviations, require acknowledgement, and do not rewrite the immutable Master Script.
