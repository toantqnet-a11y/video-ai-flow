# ContentStudio R0 — Release Gate and Cross-Epic Gap Matrix
**Refinement traceability:** EP01 channels/voice; EP02 provider & quota; EP03 video library; EP09 security, local storage & Windows; EP10 presets; EP12 queue; EP13 AI Video. PO has deferred hardware checks but not waived functional acceptance.

| Area | Engineering result | Operational acceptance | Follow-up |
|---|---|---|---|
| Kênh CRUD, status, delete/restore | Offline tests passed | Browser/HTTP pending | CI/live smoke |
| Kênh avatar upload | R0-GATE code + 6 tests | UI/browser/HTTP pending | R0-GATE live smoke |
| Kênh preset và lịch sử | Offline tests passed | UI/browser pending | R0 integration |
| Preview Hoài My/Nam Minh | Adapter/UI coded | Actual Edge/Piper/VieNeu unavailable | HW/provider acceptance |
| Danh sách video, new/duplicate/resume | Offline tests passed | Browser/HTTP pending | R0 integration |
| Registry, quota, paid approvals | Offline tests passed | Live provider invocation pending | R1/R2 integration |
| Job queue and SSE | Offline tests passed | Live HTTP and R2 worker pending | R1/R2 |
| AI Video model catalog | Preflight+catalog coded | Actual GPU model unavailable | R2/R3 |
| Database migration | v12 additive+offline tests passed | Windows filesystem and crash tests pending | Host acceptance |
| React + Fastify + Windows launcher | Source code available | **Build and live HTTP blocked (npm DNS)** | CI on networked runner |
| Browser CI / GitHub Actions | CI config authored (Linux+Windows) | **NOT RUN** | First push to GitHub |

### Gate policy
**Never mark R0 production/Windows DONE** until a dependency-enabled runner has built the UI, tested live HTTP, completed a real browser flow, and validated the target Windows host. New development R1 may continue with explicit PENDING VALIDATION labels; do not require PO to buy/prepare hardware now. AI paid usage remains OFF absent explicit job/model/budget approval.

### Next task
**R1-01 – Content Brief Form and Validation** (EP04 / US-4.1 + US-4.2 foundation). Start on current workspace; preserve R0 pending gates as a separate QA queue. Work begins with subject/idea/free prompt, target words or minutes, voice/writing style, choice of 1+ model(s) and versionable brief without executing paid AI.
