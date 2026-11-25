# Iteration 02 - Implementation Command Checklist

## Purpose
Record ingestion verification before connector or scheduler changes are reviewed.

## Local Checks
- Run connector certification suite.
- Run fake provider scan.
- Run HN adapter tests.
- Run RSS adapter tests.
- Run cursor crash/retry scenario.
- Verify normalized feed snapshots.

## Evidence To Attach
- Certification output.
- Normalized feed sample.
- Cursor state before/after scan.
- Provider error mapping sample.

## MVP Evidence Rule
- Required: fake/HN/RSS certification, repeated-scan idempotency and cursor crash/retry proof.
- Defer: broad source matrix and historical backfill tests until source demand is proven.

## Blocking Failures
- Adapter fails shared certification.
- Cursor advances before durable write.
- Provider payload leaks into feed domain.
- Source strategy is not policy-approved.
