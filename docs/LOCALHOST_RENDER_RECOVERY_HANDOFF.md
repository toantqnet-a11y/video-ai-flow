> **Actual verified Ubuntu evidence (20/10/2026):** [Workflow 39397083538](https://github.com/toantqnet-a11y/video-ai-flow/actions/runs/39397083538) **PASS**. Real production `render:hyperframes` worker OS SIGKILL; recover expired lease; old token fenced; no duplicate job; attempt 1 expired, attempt 2 succeeded; 5-scene **429 frames / 14.3 seconds / 861,481 bytes** H.264/AAC MP4; SHA256 `ae269cb7bdd91c0b62cf20df92422e1c4d81253863419847a7a020c68a06a5ff`; 51,631 ms total acceptance; **0 provider calls**. Automated real-process recovery proof only, `releaseStatus=NOT_READY`.

# LOCALHOST-07 — Real HyperFrames worker crash/restart acceptance

**Scope:** Video AI Flow remains a browser Web App + Fastify + SQLite/SP-04 renderer on localhost. Test uses a disposable folder with 5 committed local PNG/WAV fixtures, not a user's project. No paid, remote AI, TTS or GPU calls. **Release remains NOT_READY**.

## Why this test is different
This test does not simulate a failure by modifying a SQLite status row. It starts the real SP-04 JobRunner and the production HyperFrames handler in a detached OS child process, confirms a real `render:hyperframes` lease and handler entry, then sends **SIGKILL to the isolated process group**. The SQLite store must still hold the crashed job as `running` until its lease expires. A new process must recover the same durable job **without a second enqueue or a fake completed result**, produce a verified H.264/AAC MP4 and record exactly two attempts.

## Mandatory machine checks
- The original bearer/CSRF, project files and actual user content are never used.
- Parent and workers share only a temporary SQLite + local fixture directory.
- Old lease token must be fenced: an expired worker cannot commit a made-up success.
- Atomic recovery outbox event `lease_recovered`, attempt 1 `lease_expired`; new worker attempts job 2 and succeeds.
- Exact one render job after restart (SP-04 history preserved), real `hyperframes@0.8.159`, FFprobe codec/frame validation and MP4 SHA256.
- The child process group is killed together to minimize orphaned subprocesses; media folder deleted on completion.
- CI must FAIL if the second worker cannot render a real valid MP4. No mocking or FFmpeg substitute.

## Execution
Run on an isolated **Linux** host with Node >=22, project-local pinned HyperFrames and FFmpeg/FFprobe. After `npm ci --ignore-scripts`:
```
node tools/localhost-render-crash-recovery.mjs --run --strict
```
The workflow `.github/workflows/localhost-render-recovery.yml` performs this on pull requests that alter recovery/runtime code and supports an explicit manual run. The result records only summarized codes, elapsed time, attempt/outbox metrics, codec/frames, bytes and SHA256.

## Limits, not yet release-ready
A SIGKILL of a live worker after entering the real production handler is genuine process-failure evidence. It **does not yet prove** recovery after physical power loss, resume of an individual partially encoded HyperFrames scene, stable GPU inference, 35–40-minute Full HD export, resource budgets or human subtitle/music review. Full-length production acceptance requires a separate opt-in test with real telemetry. The recovery handler currently restarts an interrupted job/scene rather than resuming a partial output byte stream.
