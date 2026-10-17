# R3-13 / R3-14 status · 2026-10-16

**R3-13:** `CODE_COMPLETE_TESTED_OFFLINE`; real platform process-kill still pending. Added disk/headroom admission at API preflight and worker, filesystem failure refusal, POSIX child process-group cancellation / Windows taskkill implementation, conservative old staging cleanup, SP-04 lease recovery regression. FFmpeg scene cache reused; no new DB, no auto-paid calls or fallback.

**R3-14:** `ACCEPTANCE_HARNESS_COMPLETE__FULL_ACCEPTANCE_BLOCKED`. Executable real/offline release matrix: **8 PASS, 14 BLOCKED, 0 FAIL**. Real H.264/AAC FFmpeg 5-scene 429/429 frames PASS; 300-scene / 65,400-frame / 36.33-minute plan PASS (NO long MP4); disk estimate on this host PASS; HyperFrames runtime, Windows/browser, real AI and long render/restart gates BLOCKED.

**Release:** `NOT_READY`. Do not claim Windows/HyperFrames/35min acceptance or production readiness.
