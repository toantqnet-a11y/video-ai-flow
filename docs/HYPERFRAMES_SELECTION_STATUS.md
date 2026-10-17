# HyperFrames primary renderer — implementation status

- Product decision: **HyperFrames primary**, FFmpeg **manual fallback**; Remotion not selected.
- Code status: `CODE_COMPLETE_TESTED_OFFLINE`, target Windows/live HyperFrames still `NOT_ACCEPTED`.
- Mock/legacy tests: **747/747 entire offline suite PASS**, HyperFrames-focused 7/7 PASS, OpenAPI and SDK PASS, negative control PASS.
- Browser build: BLOCKED `vite: not found`; npm registry EAI_AGAIN. Real HyperFrames CLI: unavailable, not run.
- No paid rendering requests, remote CDN imports, extra queue or database migrations.
- Next gate: install dependencies on connected Windows, render 5-scene Vietnamese composition with real HyperFrames, FFprobe exact frames/audio/captions, then long-form and crash/restart QA.
