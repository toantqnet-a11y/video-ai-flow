# ContentStudio IA-01 — Current Status (2026-10-16)

- **CODE_COMPLETE_TESTED_LINUX_FFMPEG**, NOT production signed off.
- **IA-01:** 5 scenes, 10 SHA-verified voice/image assets, Composition v2, SP-04 persisted render, 1080×1920 H.264/AAC MP4, **429/429 actual frames**, 14.300 sec, QA PASS.
- Fixed last-stage +1-frame timestamp/encoder-padding mismatch by normalizing output PTS and enforcing exact video frame count in ffprobe QA. No schema/migration/API/SDK changes.
- **IA-02:** 300 scenes, 600 assets, 65,400 frames / 36.33 min planned and FFprobe-verified; **NO long-form MP4 rendered**.
- Tests: focused IA-01 **4/4**; full suite latest **734/734** PASS; check/SDK/negative control PASS.
- Web build BLOCKED (`vite: not found`, npm install DNS `EAI_AGAIN`); real Fastify HTTP smoke BLOCKED (`ERR_MODULE_NOT_FOUND`). Windows/browser/GPU/live providers/EXT-03 benchmark not done.
- Next: npm install on connected environment; target Windows/real browser and real 30–40-min rendering; EXT-03 same-host benchmark; R1-EXT-01 script workflow when runtime gates remain blocked.
