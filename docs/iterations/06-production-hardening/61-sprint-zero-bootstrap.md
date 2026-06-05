# Iteration 06 - Sprint Zero Bootstrap

## Bootstrap Goal
Prepare hardening work before beta-safety gates are executed.

## Setup Tasks
- Assign security, SRE, backend, QA and support owners.
- Confirm tenant isolation test scope.
- Confirm secret redaction boundaries.
- Confirm CI gate requirements.
- Confirm dashboard and support runbook ownership.

## First Artifacts
- Tenant isolation test matrix.
- Secret/redaction policy examples.
- CI gate fixture list.
- Dashboard metric list.
- Support runbook outline.

## Preflight Checks
- REST, workers, events and realtime are all in isolation scope.
- Provider credential handling is known.
- User-visible failure metrics are identified.
- Quota and backup/restore expectations are defined.

## Start Blockers
- Security owner missing.
- Tenant isolation scope incomplete.
- Redaction strategy unclear.
- Support/on-call owner missing.
