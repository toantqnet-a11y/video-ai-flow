# R2-EXT-03 · Remotion vs HyperFrames fair POC gate

**2026-10-15** · **`POC_HARNESS_COMPLETE_GATE_BLOCKED`** · Release **NOT_READY**

- R2-EXT-02 rechecked: 14/14 voice timing tests PASS; 714/714 full regression PASS unchanged.
- Reused earlier POC media, generated measured/hashed **1 / 5 / 15 scene** workloads and canonical side-by-side JSX/HTML, Vietnamese visual caption stress, same 1080×1920@30 fps; no guessed word timing.
- Created real engine runner for 3 repeats each/workload with alternating order, logs, sampled CPU/RSS and FFprobe H.264/AAC/time/fps validation. Preparatory tests 7/7 PASS.
- **Actual Remotion renders: 0. Actual HyperFrames renders: 0.** Registry DNS `EAI_AGAIN`; dependencies absent. Benchmark result has 18 `NOT_RUN`, 0 timing/CPU/RSS measured. No renderer selected.
- Older independent FFmpeg baseline is not a substitute; Vietnamese native TTS, Windows/browser/30–40 minute and production MP4 export remain open.
- Next: resolve npm installation on connected Windows machine; execute real cross-engine gate, verify media/visual/licensing and record choice before EXT-04.
