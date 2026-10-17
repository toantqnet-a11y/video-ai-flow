# SP-06 — Localhost Security & API Key Vault (security spike)

**Status:** `CODE_COMPLETE / AUTOMATED_SECURITY_TESTS_PASS / PENDING_WINDOWS_OS_VAULT_VALIDATION`. This is an independent, zero-dependency **Node 22** security spike. It is **not** yet integrated into the full Fastify application or the React UI.

## Deliverables

| Module | Contract |
|---|---|
| `src/vault.mjs` | Passphrase vault using scrypt (N=16384,r=8,p=1, random 32-byte salt) and AES-256-GCM per secret. Authenticated vault verifier, AAD-bound credential IDs/provider IDs; encrypted atomic JSON file 0600/dir 0700 on POSIX. `status/list` metadata only; `getSecret` **trusted backend adapters only**. Explicit lock/unlock. |
| `src/http.mjs` | HTTP server **binds only `127.0.0.1`**; rejects bad Host/Origin/forward headers, duplicate Host, CORS/preflight; requires ephemeral bearer for **all** `/api/` endpoints + independent CSRF header on mutation; request-body size limit, rate limits unlock failures, generic errors, safe audit events. |
| `src/endpoint.mjs` | Local endpoint transport **only loopback**; remote endpoint transport **only explicit HTTPS allowlist** with public DNS, pinned resolved address, disabled redirects, timeouts/size caps. Supports endpoint security for future ComfyUI/TTS adapters. |
| `src/demo.mjs` | Non-persistent loopback smoke test; doesn't print tokens or store credentials. |
| `test/*.test.mjs` | Negative security tests, vault restart/tamper/concurrent storage, HTTP auth/Host/Origin/CSRF, SSRF and redirects. |

## Run

```bash
cd SP-06
npm test
npm run demo
```

On Windows PowerShell with Node.js 22+, use `./Run-Windows.ps1 -Mode test` or `-Mode demo`. No external npm packages or actual paid API key are required.

### Backend-only API contract (security spike)

- `GET /health` → `{status:'ok'}` public minimal health signal.
- `GET /api/security/status` → vault mode/state/count (bearer required).
- `GET /api/security/credentials` → credential **references only**.
- `POST /api/security/vault/init` `{passphrase}` → initialize encrypted vault.
- `POST /api/security/vault/lock` → lock memory key.
- `POST /api/security/vault/unlock` `{passphrase}` → unlock (rate limited).
- `POST /api/security/credentials` `{id,providerId,apiKey}` → vault-only storage; API response `{id,providerId,stored:true}`.
- `DELETE /api/security/credentials/{id}` → delete credential.

All `/api/` calls require `Authorization: Bearer <random-session-token>`. All writes require `X-ContentStudio-CSRF: <independent-random-token>`. A **trusted desktop launcher** must deliver both tokens securely to the application frontend out of band, e.g. controlled native bootstrap. **This launcher is not built in SP-06.** Tokens are kept only in server memory and never exposed by a public `/api/session` endpoint. Do not put bearer/CSRF tokens into URL query strings, persisted app configs or logs.

## Security guarantees and explicit limitations

1. Encrypted API credentials never returned over HTTP, printed in logs or saved as plaintext by this module. Secret reading is possible from trusted server code only. Wrong key / altered ciphertext fails authentication.
2. Unlock requires user-provided passphrase. Lost passphrase is unrecoverable. JS string passphrases cannot be zeroed reliably; only derived key Buffers are zeroed on lock.
3. File permissions (`0600` / `0700`) are POSIX best effort. **Windows ACL + DPAPI/Credential Manager are NOT implemented or verified.** Production R0-03 must implement OS credential protection and verify on Windows before storing real production credentials.
4. A malicious application running as the same OS user, compromised runtime, memory dump, or compromised OS is *outside the protection guarantee* of a local passphrase vault. Vault path check reduces simple symlink abuse but is not a full defense against filesystem TOCTOU or ancestor reparse-point attacks.
5. No multi-user authentication, frontend session handoff, TLS, backup/export integration, Fastify middleware, content security review, or external provider call is included. Full Windows/browser E2E tests remain pending.
6. SSRF guard is implemented as a **separate** `requestApprovedEndpoint`; adapters from SP-02/SP-03 are not yet migrated to call it. Until migration, this module does not secure existing outbound adapters. All remote calls still require privacy consent/cost approval from existing PO policy.
7. Never infer that the proof server is internet-reachable: it binds only 127.0.0.1; browser UI login/bootstrap requires integration work.

Read `THREAT_MODEL.md` for attacker assumptions, controls and residual risk. See `reports/SP06_Security_Test_Report.md` for observed evidence.
