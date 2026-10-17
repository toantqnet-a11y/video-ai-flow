# R0-03 — Security Integration | Test Report

**Date:** 2026-10-13  · **Environment:** Linux, Node.js 22.16.0  · **Status:** CODE_COMPLETE + OFFLINE_TESTED; Fastify/Windows validation PENDING.

## What was actually tested

- `npm test` → **58/58 PASS** (previous 51 + 7 R0-03 security tests).
- `npm run check` → **PASS** (JavaScript syntax checks of security integration and API).
- SPIKE regressions using `npm test` inside each SPIKE:
  - SP-01 **4/4**, SP-02 **22/22**, SP-03 **35/35**, SP-04 **15/15**, SP-05 **16/16**, SP-06 **33/33**, SP-VID-01 **21/21**.
  - Total SPIKE **146/146 PASS**; project plus SPIKE **204/204 PASS**.
- `npm install --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=7000` → **NOT INSTALLED**: npm registry DNS `EAI_AGAIN`.

## Security coverage

1. Invalid Host, Origin and peer; duplicate Host, contradictory Content-Length/Transfer-Encoding; spoofed proxy headers.
2. OPTIONS/CORS probes; cross-site requests; encoded/ambiguous API paths; query keys containing tokens, credentials, and unauthorized parameters.
3. Global Fastify `onRequest` **hook logic** denies requests to ordinary, vault and SSE endpoints without bearer token, and denies mutation without CSRF token.
4. Pairing code is terminal-only, one-time, request schema-checked; no login cookies or URL-based auth.
5. SP-06 AES-256-GCM vault persists ciphertext only; metadata-only credential listing; API has no plaintext-secret getter.
6. Initialization and credential POST reject unknown fields; vault lock prevents writes.
7. Five wrong passphrases within 60 seconds block further attempts; concurrent requests are serialized; lockout expires.
8. Trusted in-process credential access rejects mismatched provider identity.
9. HTTP request logs use only `{method, requestId}`; adversarial query strings are not serialized.
10. Existing ComfyUI adapter URL normalization avoids resolving user-configured `localhost` via hosts/DNS instead of using literal loopback.

## A corrected pre-existing flaky regression

SP-04 `test/crash.test.js` occasionally expected the count of succeeded jobs immediately after SIGKILL to be **exactly** the count sampled before kill. Since SIGKILL is asynchronous, one last job can commit during that interval. The test now checks monotonicity (`after >= before`, still incomplete before recovery), then continues to check that all 100 jobs complete with 100 distinct logical assets. This corrects a test-only concurrency assumption, not the production queue.

## Out of scope / evidence not obtained

- No **Fastify runtime HTTP/inject E2E**: `fastify` package could not be installed via npm in this environment. Hook tests use a local fake registration harness; they do not prove Fastify runtime integration.
- No React browser test, Windows Defender/ACL or Windows Credential Manager/DPAPI proof.
- No live remote provider, paid billing approval workflow, Windows build/package signing, public-network malicious-site simulation, security penetration assessment or native launcher token handoff.
- SP-06 SSRF helper is available, but has **not yet been wired into every remote adapter**. This task locks ComfyUI URL to an explicit loopback origin; new remote providers must use an approved egress transport and a separate PO-sanctioned consent/billing gate.
- Treat API keys as test-only fixtures until R0-03 Fastify E2E and Windows secret storage checks pass.

## Commands / evidence

```bash
npm test
npm run check
for dir in SP-01 SP-02 SP-03 SP-04 SP-05 SP-06 SP-VID-01; do (cd spikes/$dir && npm test); done
```

Captured output: `docs/evidence/R003_app_tests.txt`, `docs/evidence/R003_static_check.txt`, `docs/evidence/R003_SP-*_regression.txt`. npm failure details: `docs/evidence/R003_npm_install.txt`.
