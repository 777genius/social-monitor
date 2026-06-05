# Iteration 07 - Detailed Execution Plan

## Purpose

Launch a controlled beta that proves the end-to-end product loop and produces useful learning without overpromising source coverage.

## Phase 01 - Beta Scope Freeze

### Steps

1. Freeze supported source list.
2. Freeze core workflow.
3. Freeze mobile screens.
4. Freeze summary schema.
5. Freeze alert/digest channel.
6. Define beta success metrics.
7. Define known limitations.
8. Define source coverage language.
9. Define no-go features.

### Scope Freeze Implementation Steps

1. Write beta scope table with in/out areas.
2. Freeze supported source list and readiness states.
3. Freeze REST/OpenAPI, event and summary schema versions for launch.
4. Freeze mobile core screens and generated-client version.
5. Publish known limitations and source coverage language.
6. Record accepted MVP gaps with owner and revisit trigger.
7. Add source expansion decision rule to support workflow.
8. Confirm beta blockers list with engineering, product and support.

### Edge Cases

- Important beta user asks for unsupported source.
- Summary quality is good but source coverage is weak.
- User expects team/agency features.
- Requested feature would change frozen API/mobile contract.
- Supported source becomes degraded before invite.
- Accepted MVP gap is not visible to users/support.

### Acceptance Gate

- Beta scope is written and cannot expand without explicit decision.
- Freeze evidence includes contracts, source list, mobile version and known limitations.

## Phase 02 - Onboarding Support

### Steps

1. Write onboarding guide.
2. Write topic setup guide.
3. Write source limitation guide.
4. Write summary interpretation guide.
5. Create support intake form.
6. Create admin support dashboard.
7. Create known issues page.
8. Create data deletion/export request path.

### Onboarding/Support Implementation Steps

1. Create first-run checklist inside app or onboarding guide.
2. Add good/bad topic examples.
3. Add source limitation copy for HN/RSS and future unsupported sources.
4. Add first scan status explanation and expected wait.
5. Add support intake taxonomy and required evidence fields.
6. Add support-safe dashboard for tenant/topic/source/scan/summary/delivery status.
7. Add known limitations page linked from onboarding and support.
8. Add manual export/delete request workflow with owner and SLA expectation.

### Edge Cases

- User creates poor keywords and blames source.
- User does not understand delayed scans.
- User asks why source item is missing.
- User asks support to inspect private/raw source content.
- User reports summary issue without topic/source context.
- User wants unsupported source during first setup.

### Acceptance Gate

- Support can answer common questions without engineering intervention.
- Support can classify issues and attach evidence without DB/shell access.

## Phase 03 - Launch Readiness

### Steps

1. Run full smoke test from fresh tenant.
2. Run source outage drill.
3. Run AI provider outage drill.
4. Run quota exhaustion drill.
5. Verify dashboards.
6. Verify alerting.
7. Verify backup/restore basics.
8. Verify rollback/disable-source procedure.
9. Verify mobile release build.
10. Verify privacy/security checklist.

### Launch Readiness Evidence

1. Full CI and contract checks pass.
2. Fresh tenant E2E completes topic -> source -> scan -> feed -> summary -> feedback.
3. Connector certification passes for enabled sources.
4. Summary eval/citation/cost gates pass.
5. Tenant isolation and redaction checks pass.
6. Provider outage, AI outage, quota exhaustion and restore drills pass or have accepted exception.
7. Dashboards and alert-to-runbook links are verified.
8. Mobile build points to correct API and generated contract.
9. Rollback/pause-source owners are available.
10. Known limitations are published.

### Edge Cases

- Source fails during demo.
- Summary worker backlog grows.
- Mobile app uses stale OpenAPI model.
- Invite goes out before rollback owner is available.
- Launch environment has different source credentials/quota from staging.
- Restore drill passes DB but misses operational tables.

### Acceptance Gate

- Launch checklist passes with no critical unresolved risks.
- Launch evidence bundle is complete and linkable.

## Phase 04 - Post Beta Learning Loop

### Steps

1. Collect usage metrics.
2. Collect summary quality feedback.
3. Track unsupported source requests.
4. Track onboarding confusion.
5. Track false positives/false negatives.
6. Review source health weekly.
7. Prioritize next iteration by evidence.
8. Update architecture memory after learnings.

### Learning Loop Implementation Steps

1. Review usage, cost, source health and summary feedback weekly.
2. Convert wrong-fact/bad-citation feedback into eval fixtures.
3. Classify unsupported source requests by value, access path, cost and risk.
4. Identify onboarding copy/product fixes separately from architecture changes.
5. Update ADRs when source strategy or architecture assumptions change.
6. Update post-MVP backlog with blocker/gap/opportunity/deferred classification.
7. Decide whether beta expands, holds or reworks.

### Edge Cases

- Users ask for breadth but value depth.
- Users prefer alerts over dashboards.
- Source cost exceeds value.
- Summary is useful but too late.
- Feedback is subjective and conflicts with automated eval score.
- A requested source is valuable but only available through paid provider path.
- Support burden increases faster than user value.

### Acceptance Gate

- Beta produces clear next roadmap decisions, not vague feedback.
- Learning report links metrics, feedback, incidents and roadmap decisions.
