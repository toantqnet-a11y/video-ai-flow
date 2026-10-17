# Chromium integration test blocker — SP-05

Attempted headless Playwright Chromium on 2026-10-13:

```
Page.goto: net::ERR_BLOCKED_BY_ADMINISTRATOR at http://127.0.0.1:4175/
Page.goto: net::ERR_BLOCKED_BY_ADMINISTRATOR at file:///.../SP-05/index.html
```

The local Node HTTP server is reachable using `curl` (HTTP 200). The installed Chromium reads `/etc/chromium/policies/managed/000_policy_merge.json` with `URLBlocklist: ["*"]`. Browser cannot navigate to any test page, including a `data:` URL. Automated browser interaction and render benchmarks are therefore **NOT RUN / NOT VERIFIED** in this environment. The prepared test script remains in `test/browser_sp05.py` for replay on an unblocked development machine.

This policy was not modified or bypassed. No screenshot/performance pass claim can be made.
