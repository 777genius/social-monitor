# Iteration 06 - Scope Change Decision Tree

## Decision Goal
Prevent hardening changes from diluting beta safety gates.

## Accept Now If
- Change strengthens tenant isolation.
- Change improves secret redaction.
- Change improves CI gates, dashboards, quotas or recovery.

## Defer If
- Change adds enterprise compliance certification.
- Change adds advanced autoscaling.
- Change adds incident automation beyond beta readiness.

## Escalate To ADR If
- Change alters security model.
- Change changes contract compatibility policy.
- Change changes quota/cost enforcement semantics.

## Block If
- Change allows cross-tenant risk to remain unowned.
- Change weakens redaction or secret handling.
- Change removes beta-blocking CI or observability gates.

## Required Record
- Beta gate impact.
- Security impact.
- Support impact.
- Residual risk owner.
