# ContentStudio — R0-11 Test Report (2026-10-14)

**Task:** R0-11 / EP10 — Video Config Snapshot Resolver. **Host:** Linux, Node.js 22.16.0. **Windows/Browser:** Not run.

| Verification | Actual result | Notes |
|---|---:|---|
| Node monorepo test suite (`npm test`) | **123/123 PASS** | 108 prior + 15 R0-11 tests (10 core + 3 API + 2 UI-helper). |
| Sprint 0 Spike suites SP-01..SP-VID-01 | **146/146 PASS** | Individually executed all seven `npm test` suites. |
| `npm run check` | PASS | JS syntax + generated API drift check. |
| `npm run typecheck:sdk` | PASS | TypeScript SDK declarations. |
| TypeScript JSX parser (4 JSX files) | PASS (syntax only) | Does not compile/bundle React or check browser behavior. |
| React/Vite `npm run build:web` | **BLOCKED** | `vite: not found`; npm dependencies not installed. |
| Real Fastify HTTP + Browser | **NOT VERIFIED** | Requires npm dependencies and permitted browser runtime. |
| Windows, FFmpeg 1080p, GPU, AI providers | **NOT VERIFIED** | PO-approved environment deferral. |

## Acceptance coverage (implemented & automatically checked)

1. New video retains channel preset origin and creates immutable v1 config revision.
2. Channel preset edits do not change earlier video's origin, effective config or another video's overrides.
3. Strict validated field overrides; reject unknown keys, nested objects, invalid numbers, secret-shaped fields and unapproved remote/paid activation.
4. Preview is read-only and reports change paths, affected outputs and existing-media counts.
5. Existing scenes/script/assets may require explicit `confirmImpact`; rejecting saves do not modify DB or assets.
6. Save uses `rowVersion` optimistic lock, persistent immutable revisions; semantic no-op does not grow revisions.
7. Resetting overrides returns to the video's original channel snapshot.
8. Save with active video jobs is blocked to avoid ambiguous provider outputs.
9. SQLite migration v6→v7 backs up and backfills existing videos without changing checksums of migrations v1–v6.
10. Source snapshot and historical revisions cannot be modified via SQL UPDATE/DELETE triggers.
11. Existing voice/media file revisions, scene text and timeline are untouched when only config changes; no regeneration job is enqueued.
12. API routes and OpenAPI catalog match; handlers preview/save return stable expected status and error codes.
13. Asset queue defaults to the video's effective preset even if the channel was edited afterward.
14. Pure UI helper resets individual inherited fields without losing unrelated video-level overrides.

## Deferred acceptance / warnings

- The configuration impact is a **persistent review signal**, not yet a complete invalidation engine. Existing rendered assets are not automatically marked unusable; R2/R3 must add and test stale-asset gating, targeted re-generation and FFmpeg render verification.
- No physical Windows validation, real model quotas or provider inference, React/Vite bundle, or Fastify HTTP test. Do not label R0-11 production ready.
- R0-07 Account/Provider Registry (actual provider availability, cost approvals and quota) is still pending.

**Result:** CODE_COMPLETE + AUTOMATED_TESTS_PASS (offline only). No new PO sign-off required for this task.
