# Iteration 06 - Implementation Command Checklist

## Purpose
Record hardening verification before beta-safety changes are reviewed.

## Local Checks
- Run tenant isolation suite.
- Run secret redaction tests.
- Run contract/event/migration CI gate checks.
- Run `npm run check:observability` after dashboard or alert definition changes.
- Run quota exhaustion scenario.
- Run backup/restore verification.

## Evidence To Attach
- Tenant isolation output.
- Redaction output.
- CI gate evidence.
- Dashboard or metric sample.
- Observability contract validator output.
- Restore verification result.

## MVP Evidence Rule
- Required: tenant isolation, redaction, quotas, CI gates, backup/restore and support-visible dashboard proof.
- Defer: enterprise compliance certification, multi-region failover and advanced chaos suites.

## Blocking Failures
- Cross-tenant access is reproducible.
- Secret appears in logs, traces or errors.
- Breaking contract passes checks.
- Support cannot diagnose common failure from available signals.
