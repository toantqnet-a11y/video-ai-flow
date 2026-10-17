# R1-EXT-01 — Script Skills workflow contract (2026-10-16)

**Goal:** Provide a repeatable editorial pipeline: **idea/source → 3-second hook → problem → explanation → examples/solution → CTA → source checks → AI judge/retry (existing R1-04/05) → explicit Master Script approval (existing R1-06) → structured JSON**. This is a new **built-in** deterministic skill recipe engine; it does **not** install or execute an external Superpowers project/plugin, nor does it claim internet research was performed.

## User-visible controls

- In **Brief & Cấu hình**, choose a script template (educational/storytelling/analysis/review/shorts). It persists as `scriptSkillId` in each **immutable brief revision**; missing value in an old brief maps to `educational` (backward compatible). The next outline/chapter LLM workers read the already-pinned brief snapshot, so editing the template later does **not** alter in-progress jobs.
- **Xem kế hoạch 5 chặng**: read-only plan from a saved brief revision; five stages' word counts sum exactly to the planned total, with ~3-second opening hook. Estimates are not evidence of voice duration.
- In **Master Script**, after an explicit approval, **Xuất JSON kịch bản đã duyệt** exports source-aligned segments with narration, subtitle text, visual cue placeholder, estimate and SHA-256, without creating jobs or changing the approved script. The UI cannot export unsaved textarea changes.

## API endpoints (bearer + CSRF)

| Method | Path | Request | Result |
|---|---|---|---|
| GET | `/api/content/script-skills` | none | Five allowlisted template descriptors |
| POST | `/api/videos/:id/content/script-skills/plan` | `{briefRevision:1,scriptSkillId?:'educational'}` | v1 source-pinned recommendation; `willGenerate:false` |
| POST | `/api/videos/:id/content/script-skills/export` | `{approvedRevision:1,scriptSkillId?:'educational'}` | v1 lossless approved master script segmentation; `willGenerate:false` |

No new SQLite migration. No external HTTP request, credential access, provider switch, spend or queue operation. `master_approval` is checked against the currently approved revision and `videos.master_script`, including archived/tombstoned checks via the existing repository.

## Export integrity / limitations

- `segments[i].sourceStart` / `.sourceEnd` are JavaScript UTF-16 indices into the **approved** master script. `segments.map(s => s.spokenText).join('')` is byte-for-byte/equivalent JS-string content to the master text (including Vietnamese/emoji/line breaks); `sourceSha256` and top-level `scriptSha256` allow verification. The export `digest` is SHA-256 of the stable JSON payload excluding the digest property.
- `subtitleText=spokenText.trim()` is a default display suggestion; it is **not** word-level forced alignment. `estimatedDurationMs` uses brief WPM and is **not** measured TTS. `visualCue=''` is for human review/AI suggestion later.
- Stages on segments are **position-based suggestions, not verified semantic labels**; quality and factual accuracy require editorial review. Research status distinguishes missing sources vs user-supplied **unverified** material. The skill engine never makes up evidence, citations or URLs.
- The rest of R1 (AI Judge, retry, versioning, approval) remains authoritative. Existing outline/chapter JSON response contracts are unchanged. This task does not add a new AI generation provider.

## Acceptance / blockers

`npm run test:r1ext01` 10/10; `npm run test:all` 744/744; `npm run check`, `npm run typecheck:sdk`, `npm run test:negative-control` PASS; JSX parse PASS. Actual React/Vite build blocked `vite: not found`, live HTTP smoke blocked missing dependencies. No external source research, automatic citation verification, real inference or Windows/browser acceptance. Release remains **NOT_READY**.
