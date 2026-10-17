# R1-EXT-01 Test Report — 2026-10-16

## Commands executed (Linux, Node 22.16)

| Command | Result |
|---|---|
| `node --test packages/core/test/script-skills-r1ext01.test.mjs apps/api/test/script-skills-r1ext01.test.mjs` | **10/10 PASS** |
| `npm run test:all` | **744/744 PASS** |
| `npm run check` / OpenAPI generated drift | **PASS** |
| `npm run typecheck:sdk` | **PASS** |
| `npm run test:negative-control` | **PASS**, deliberate failure correctly detected |
| Parse changed JSX via TypeScript `createSourceFile` | **2/2 PASS** |
| `npm run build:web` | **BLOCKED** (Vite missing, exit 127) |
| `npm run test:live-http` | **BLOCKED** (`ERR_MODULE_NOT_FOUND`) |

## Coverage

Allowlisted static skill recipes; each has five stages; 3-second hook & exact word target; immutable source revision; unknown preset and injected disallowed arguments; unchanged provider contracts; lossless source slice reconstruction (Vietnamese, punctuation, emoji, long multiline); digest mismatch failure; default/manual approval gate; no new domain events or queue jobs from preview/export; cross-video revision isolation. The legacy 734 tests still pass.

## Not covered / not claimed

Does **not** fetch web research or prove factual accuracy; no real LLM outputs/quality comparison, no word alignment, no GPU or Windows acceptance, no Vite browser build, no full 30–40-minute MP4 render, no Remotion/HyperFrames benchmark. Test evidence is offline only; release **NOT READY**.
