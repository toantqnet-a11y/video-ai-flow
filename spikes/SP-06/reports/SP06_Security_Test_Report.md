# SP-06 Security Test Report — 2026-10-13

**Runtime:** Linux container, Node.js v22.16.0. **No Windows computer, GPU, live AI API or real production credential used.**

## Automated tests (actual executed)

| Task | Tests | Pass | Fail |
|---|---:|---:|---:|
| SP-01 | 4 | 4 | 0 |
| SP-02 | 22 | 22 | 0 |
| SP-03 | 35 | 35 | 0 |
| SP-04 | 15 | 15 | 0 |
| SP-05 | 16 | 16 | 0 |
| SP-06 | 33 | 33 | 0 |
| **Total** | **125** | **125** | **0** |

Run `cd SP-06 && npm test`. Raw TAP logs: `reports/regression-sp01.txt`…`regression-sp06.txt`.

## Security evidence

- Vault fail-closed, lock/unlock across restart, wrong passphrase and tamper rejection.
- AES-256-GCM encryption and AAD validation; secrets absent from vault file and metadata; 18 concurrent writes safe.
- HTTP bound to 127.0.0.1, bad Host/Origin and duplicate Host rejected; Authorization bearer + CSRF for mutation; CORS not enabled.
- Invalid payload/content-type/path reference denied; unlock attempts rate limited; audit logs do not include canary API keys/tokens.
- Endpoint blocks private/metadata IP, arbitrary remote hosts, remote HTTP, credentials in URL, redirects, oversized bodies; actual loopback pinned request succeeds.
- `npm run demo` returns health 200 with uninitialized vault, no user credentials.

## Remaining gates (not DONE)

- Windows DPAPI/Credential Manager/ACL and trusted launcher bootstrap not implemented/verified.
- Not integrated into production Fastify, SP-02/SP-03 outbound adapters, SP-04, or backup/export pipeline.
- Same-user malware, filesystem reparse/TOCTOU, pentest and Windows E2E remain unvalidated.
- Paid provider approval routing unchanged and not tested here.

**Status:** CODE_COMPLETE + TESTED_PORTABLE_SECURITY_POC / PENDING_WINDOWS_AND_INTEGRATION.
