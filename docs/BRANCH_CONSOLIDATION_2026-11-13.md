# Branch Consolidation Audit — 2026-11-13

Repository: toantqnet-a11y/video-ai-flow  
Canonical base inspected: main @ a714f0354693a46112356050a63d43768d064e56  
Branch inventory: 25 refs returned by GitHub API (including main and the documentation handoff branch).

## Outcome

**No unmerged application-code branch was identified that should be blindly merged into main.** Feature branches map to historical PRs #1–#24. PRs #1–#16, #18–#22 and #24 were merged; PR #17 and PR #23 were explicitly closed as superseded. PR #26 is the current documentation handoff PR.

The branch-vs-main compare API reports many historical branches as diverged with apparent ahead commits. This is expected after squash merges: original feature commit SHAs are not ancestors of the squash merge commit, so commit ancestry/ahead counts alone do not prove missing code. PR merge records and explicit supersession notes were used to decide whether to integrate.

## Branch-to-PR inventory

| Branch | PR | Outcome | Consolidation decision |
|---|---:|---|---|
| fix/fastify-static-security-2026 | #1 | Merged | Already in main |
| wi03/windows-verification | #2 | Merged | Already in main; historical evidence only |
| fi04/real-hyperframes-windows | #3 | Merged | Already in main; historical Windows evidence only |
| fi04/acceptance-05-10 | #4 | Merged | Already in main; historical gates retained |
| feat/ai-video-r2vid01-05 | #5 | Merged | Already in main |
| feat/r3vid03-stream-gpulock-and-uncommitted-batch | #6 | Merged | Already in main |
| feat/hf-cache-advanced-jobs-storage-and-safe-media | #7 | Merged | Already in main |
| feat/r403-restore-r308-cache-guards | #8 | Merged | Already in main |
| feat/ext07-atomic-local-image-batch | #9 | Merged | Already in main |
| feat/r3vid03-r308-r2vid02-native-evidence | #10 | Merged | Already in main |
| feat/r3vid03-clip-proof-r308-cache-regression-r2vid02-dual-workflow | #11 | Merged | Already in main |
| docs/video-native-gates-canonical-status | #12 | Merged | Already in main |
| chore/local-web-69-task-backlog | #13 | Merged | Already in main |
| feat/localhost-production-flow-ux | #14 | Merged | Already in main |
| test/localhost-browser-api-e2e | #15 | Merged | Already in main |
| feat/local-operator-repair-session | #16 | Merged | Already in main |
| ci/local-hyperframes-five-scene-proof | #17 | Closed, not merged | Superseded by clean OS-neutral PR #18; do not merge |
| ci/localhost-hyperframes-proof-clean | #18 | Merged | Already in main |
| feat/local-render-resume-history | #19 | Merged | Already in main |
| fix/local-render-live-status-resume | #20 | Merged | Already in main |
| test/localhost-real-render-crash-recovery | #21 | Merged | Already in main |
| qa-b04-b06-browser-e2e | #22 | Merged | Already in main |
| qa-b05-waveform-browser-e2e | #23 | Closed, not merged | Superseded by merged P0 PR #24; do not merge |
| fix/p0-uat-r1-waveform-sync | #24 | Merged | Already in main; main is at PR #24 merge commit |
| docs/ai-agent-handoff-2026-11-13 | #26 | Open | Current documentation consolidation PR |

## Specific unmerged PR decisions

- **PR #17:** its PR description says it was superseded by clean PR #18 after PR #16 was squash-merged; #18 contains the OS-neutral renderer workflow and results handoff. No separate merge is appropriate.
- **PR #23:** its PR description says it was superseded by merged PR #24; QA-B04/B05/B06 coverage and dialogue handling were carried forward into #24. Remaining Browser E2E failure and UAT work are tracked by Issue #25. No separate merge is appropriate.
- **PR #26:** documentation-only changes; this audit and agent handoff are being added to the same PR.

## Code consolidation result

- All feature PRs marked merged are already integrated into main; no cherry-pick or branch merge was performed. Re-merging squash-merged branches risks reintroducing stale snapshots and conflicts.
- The two unmerged code PRs are explicitly superseded; their intended successor work is present through #18 and #24.
- Therefore this pass makes **no speculative application-code changes**. The correct next code change is the P0 Browser E2E repair in Issue #25, followed by QA-B05 real WAV waveform and Audio Sync verification.
- Historical Windows-only scripts/evidence are left intact for traceability; they are not current browser-first product acceptance criteria.

## Verification limits

This was a GitHub metadata/compare/PR-record audit. It did not clone the repository, execute the test suite, re-run workflows, or verify a fresh local MP4 export. It does not certify UAT readiness. Historical latest known result on PR #24 head remains: ContentStudio CI PASS, HyperFrames MP4 Proof PASS, R2VID diagnostics PASS, Localhost Browser E2E FAIL.