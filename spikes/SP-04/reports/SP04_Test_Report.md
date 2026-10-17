# SP-04 Test Report — 2026-10-13

## Acceptance evidence

| Acceptance criterion | Evidence | Result |
|---|---|---|
| Persist 100 jobs and finish simulated DAG | `test/runner.test.js`: 100 jobs, deps, cap concurrency=5 | PASS (Linux) |
| Real child-process crash and resume | `test/crash.test.js`: start worker, SIGKILL mid-queue, lease recovery, restart | PASS (Linux) |
| Do not rerun valid `succeeded` jobs | Crash test post-restart: 100/100 succeeded, `claim()` returns null, attempt count unchanged | PASS (Linux) |
| One committed asset per logical revision | `assets.logical_key PRIMARY KEY`, fencing validation, 100 unique rows after restart | PASS (DB-only synthetic assets) |
| Late worker cannot commit after lease loss | `test/store.test.js`: old token rejected, new token succeeds | PASS |
| Retry and dependent failure propagation | `test/store.test.js` and `test/runner.test.js` | PASS |
| Pause/resume/cancel persisted and stale worker fenced | `test/store.test.js` | PASS |
| Replay missed outbox events via cursor/SSE | `test/api.test.js`; SQLite outbox transactional | PASS (loopback HTTP) |
| Cross-client claims are atomic | `test/store.test.js` two DB clients on same file | PASS |
| Production filesystem staging, GPU/Windows and real provider | Not part of this spike / hardware missing | NOT VERIFIED |

## Commands and recorded output

```sh
cd contentstudio-sprint0/SP-04
npm test
# 15 tests; 15 pass; 0 fail
node src/cli.js demo ./data/queue.sqlite
# {"total":100,"succeeded":100}
```

Regression executed in extracted SP-01, SP-02, SP-03 directories: **4/4**, **22/22**, **35/35** PASS. Combined **76/76** automated tests across SP-01..SP-04, but coverage is limited by module boundaries. Test fixtures are simulated media/handlers, **not proof of AI/Windows provider operation**.

**Platform:** Linux container, Node `v22.16.0`; built-in SQLite is experimental.

## Deferred gates / honest limitations

The crash test kills a child process, not the entire operating system; real sudden power loss and filesystem corruption are untested. The test's fake asset paths prove uniqueness of **database commitments only**. They do not prove atomic placement or integrity of actual media files. On Windows, process termination / SQLite WAL performance / antivirus interactions and real provider side effects remain unverified. Metered provider exactly-once request billing cannot be assured by fencing alone.
