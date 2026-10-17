# SP-06 — Threat model & security acceptance (2026-10-13)

## Assets and trust boundaries

**High-value assets:** provider API credentials, channel/video scripts, local media project files, job state, personal content, billing authorization metadata. **Trusted:** ContentStudio backend process + authenticated local UI launcher. **Untrusted:** random website visited in browser, external provider response, pasted endpoint URL, arbitrary asset import, remote or LAN clients. **Separate trust:** Windows OS user/DPAPI, optional ComfyUI/Piper service (loopback-only until explicitly configured).

| Threat | Example | Implemented mitigation | Remaining gap |
|---|---|---|---|
| DNS rebinding and Host spoofing | hostile webpage changes DNS to 127.0.0.1 | exact Host + loopback socket check; duplicate Host and forwarded headers rejected | requires production Fastify application wiring |
| Cross-site localhost writes | hostile browser submits key change or render request | reject foreign Origin, no CORS, bearer + separate CSRF mutation header, content-type check | native browser app secure token handoff not implemented |
| Stolen API key via backup/log/network | debug logging secret text | encrypted at rest, API returns references only; audit whitelist event/code | external adapters and backup pipelines not migrated |
| Vault offline theft/tamper | copied JSON or edited ciphertext | scrypt, AES-GCM, AAD and encrypted verifier; tamper fails | physical capture, weak passphrase and Windows ACL not verified |
| Credential brute force via API | repeated guessed passphrase | 5 failed unlocks per 60 s per loopback peer | resets on restart, all users share loopback; durable throttle later |
| SSRF / cloud metadata | custom TTS URL requests 169.254.169.254 | endpoint allowlist, loopback-only local, HTTPS + public-DNS remote, pinned lookup and no redirects | endpoint adapter integration, proxy/DNS hardening review |
| File path traversal | credential ID `../../x` | strict ID whitelist + vault storage fixed path | broader project media file routes require separate review |
| Resource exhaustion | huge JSON payload or image response | max request body, max response size, timeout | global throttling, media upload/queue quotas deferred |
| Surprise AI charges | fallback to paid model | PO-approved paid OFF policy remains unchanged | actual paid guard in provider routing EP02/EP12 (not implemented here) |
| Other process on same OS user | malware with file/process access | no strong isolation provided by this spike | Windows DPAPI, runtime integrity, OS controls, threat-model review |

## Definition of acceptance for SP-06 spike

- `AC-S06-01`: server address exactly `127.0.0.1`; bad Host/Origin and preflight rejected.
- `AC-S06-02`: no `/api/` endpoint exposes secret, and mutation requires bearer + CSRF.
- `AC-S06-03`: vault file lacks plaintext key, wrong unlock/tamper fail, after restart correct passphrase succeeds.
- `AC-S06-04`: server audit responses and stored metadata contain no secret/password/token.
- `AC-S06-05`: URL policy blocks loopback escape, private/IP metadata, arbitrary remote/HTTP and redirects.
- `AC-S06-06`: passphrase lock and unlock, concurrency and deletion behavior verified.

**Pass means proof-of-concept code/test pass on Linux, not Windows production security certification.**
