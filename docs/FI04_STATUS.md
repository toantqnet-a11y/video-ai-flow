# FI-04 Status — 17/10/2026

Release: `NOT_READY`.

- FI-04-01: runner + watchdog + negative/positive tests IMPLEMENTED; full 875/875 PASS and independent 19/19 batches 875/875 PASS. The intermittent historical FFmpeg hang has not been conclusively root-caused; repeated Windows CI validation still required.
- FI-04-02: dependency lock/installation NOT ACCEPTED. npm registry DNS currently `EAI_AGAIN`; no reviewed/committed package-lock and no installed Vite/Fastify/HyperFrames.
- FI-04-03: build and real HTTP NOT ACCEPTED. Strict checker explicitly blocks them before dependencies are ready.
- AI Video: single master backlog generated (`59` tasks: `42` base, `14` video, `3` FI-04). Protocol Spike and capability registry have pre-existing code; real generative footage/production clip path not verified.
- No automatic cloud/paid provider calls, no new migration or queue, no fallback change.

See `docs/FI04_TEST_REPORT.md` and `docs/FI04_HANDOFF.md` for verification and handoff.

FI-04-04 update (2026-10-17): new five-scene SP-04 queued acceptance harness and project-local CLI hardening implemented; real renderer blocked on missing verified lock and runtime; consolidated backlog now 60 IDs. See `docs/FI0404_HANDOFF.md`.

FI-04-05 (2026-10-17): hardened React timeline keyboard/trim/reorder/voice invalidation, new browser inspection tool and operator runbook. FI0405 focused 10/10 PASS; Windows/browser/Vite still blocked. Backlog 61 IDs. Fresh batched suite incomplete after 10 passed batches; NOT_READY. See docs/FI0405_*.
