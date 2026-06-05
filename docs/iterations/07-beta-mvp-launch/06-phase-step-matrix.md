# Iteration 07 - Phase Step Matrix

## Phase 01 - Beta Scope Freeze

### Build Steps

1. Freeze supported sources.
2. Freeze core API.
3. Freeze API/operator flows and future frontend contract assumptions.
4. Freeze summary schema.
5. Freeze delivery channel.
6. Define success metrics.
7. Define known limitations.
8. Define no-go list.

### Dependencies

- Completed hardening gates.

### Edge Cases

- Important user requests unsupported source.
- Source breaks before launch.
- Feature creep threatens reliability.

### Validation

- Scope is locked in writing.

## Phase 02 - Onboarding Support

### Build Steps

1. Write onboarding docs.
2. Write source setup docs.
3. Write topic-quality guide.
4. Write summary interpretation guide.
5. Create support intake.
6. Create admin support view.
7. Create known issues page.

### Dependencies

- Stable UX and source list.

### Edge Cases

- User creates poor topic.
- User misunderstands source limitations.
- User expects instant scans.

### Validation

- Support can answer common questions without engineering.

## Phase 03 - Launch Readiness

### Build Steps

1. Run fresh-tenant smoke test.
2. Run source outage drill.
3. Run AI outage drill.
4. Run quota drill.
5. Verify dashboards.
6. Verify rollback.
7. Verify backups.
8. Verify API/operator harness and generated-client contract.

### Dependencies

- Completed beta scope.

### Edge Cases

- Source fails during demo.
- Summary worker backlog.
- Generated client schema drift.

### Validation

- Launch checklist has no critical blockers.

## Phase 04 - Post Beta Learning Loop

### Build Steps

1. Track usage metrics.
2. Track summary quality.
3. Track source requests.
4. Track onboarding friction.
5. Track false positives.
6. Run weekly review.
7. Update roadmap.
8. Update architecture memory.

### Dependencies

- Beta feedback and telemetry.

### Edge Cases

- Users want breadth but use only two sources.
- Users ignore dashboard and rely on alerts.
- Source cost exceeds value.

### Validation

- Next roadmap decisions are evidence-based.
