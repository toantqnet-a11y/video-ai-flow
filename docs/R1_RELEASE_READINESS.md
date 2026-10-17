# R1 Release Readiness / PO Acceptance Matrix

**Date:** 2026-10-14 — R1-08 technical regression checkpoint.

| Scope | Engineering evidence | Real runtime acceptance |
|---|---|---|
| R1-01 Brief/versioned target | Offline tests passed | Browser/HTTP outstanding |
| R1-02 Outline planning & job | Offline tests passed | Live model quality outstanding |
| R1-03 5×3 parallel chapter DAG | R1-08 15/15 simulated jobs | Live models, latency/quality outstanding |
| R1-04 AI Judge weighted rubric | Tests on controlled JSON | Judge correlation with editorial quality outstanding |
| R1-05 Retry immutable drafts | Offline tests passed | Real provider completion outstanding |
| R1-06 Master explicit approval | Version/freeze/guard and mock 5-chapter approval tested | Editor UX and data audit outstanding |
| R1-07 Remote dispatch/paid policy | Mock HTTP, free/paid fail-closed tests | Live quota/billing/provider proof outstanding |
| R1-08 Long-form policy regression | 479/479 Node tests; 30/35/40-min structural rehearsals | Real 30–40min audio/script, Windows, Fastify, web build outstanding |

## Decision
- **Engineering handoff to R2-01: YES** (PO previously allowed development without target Windows hardware).
- **R1 production/release acceptance: NO** until the runtime gates above pass.
- **No additional PO decision needed** for code work; any new paid-provider entitlement or auto-billing mode remains explicitly subject to PO approval.
