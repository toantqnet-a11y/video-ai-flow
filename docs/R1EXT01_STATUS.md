# R1-EXT-01 status — 2026-10-16

**CODE_COMPLETE_TESTED_OFFLINE** · 10/10 focused; 744/744 full · No external research, no paid calls, no new migrations.

- Five editorial presets + hook/problem/explanation/examples/CTA stage budgets; saved `scriptSkillId` in immutable R1 brief history.
- Existing R1-02/03 prompts use the pinned preset instructions and preserve current strict outline/chapter JSON outputs. R1-04/05 AI Judge/retry and R1-06 approval remain the only publication path.
- New preview/export authenticated API and generated OpenAPI/SDK; React Brief skill picker / preview; Master Script JSON export for **approved** revision only.
- Export preserves entire approved source by UTF-16 offset, verified SHA-256; subtitle timing is an estimate, not measured, and stages are suggestions.
- `npm run test:r1ext01`, `npm run test:all`, `npm run check`, `npm run typecheck:sdk`, `npm run test:negative-control`: **PASS**. JSX syntax parsed PASS.
- **Blocked:** Vite missing; Fastify `ERR_MODULE_NOT_FOUND`; Windows/browser/live LLM and full 30–40min encoded MP4 unverified. EXT-03 Remotion/HyperFrames still NOT_RUN.
- Next: complete IA-01/IA-02 external runtime gates, then genuine EXT-03 same-host benchmark. A real automatic research/citation service is a separate future task, not silently implied by “Superpowers-style”.
