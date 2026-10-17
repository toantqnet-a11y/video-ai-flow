# R3-01 Test Report — 2026-10-16

- `npm run test:r301`: 8/8 PASS — generated/voice selective invalidation; manual pin preserved; switched video mode releases incompatible pin (immutability retained); optimistic conflict/no-op; explicit text consent & Vietnamese Unicode; rejection of arbitrary routing keys; approved Master Script and immutable scene-builder revision preserved; authenticated API paths.
- `npm run test:all`: expected baseline 751 + 8 new = **759/759 PASS**.
- `npm run check`: PASS, includes generated OpenAPI/SDK drift gate.
- `npm run typecheck:sdk`: PASS.
- `npm run test:negative-control`: PASS (deliberate failing test is correctly detected).
- JSX parser: source parsed with TypeScript JSX parser (not a production React bundle).
- `npm run build:web`: BLOCKED (`vite: not found`, exit 127). Real React/browser/Fastify/Windows remains unverified.
- There is NO inference or paid provider call, and no new migration. IA-02 acceptance remains 5 PASS / 11 BLOCKED based on previous run; it is NOT reclassified as passed.
