# Threat Modeling

Date: 2026-05-31
Status: baseline threat modeling memory

## Decision

Threat modeling is required for security-sensitive boundaries before production.

Use lightweight STRIDE-style analysis and store models/docs in the repo. Use OWASP Threat Dragon later if diagrams and reports become useful.

References:

- OWASP Threat Modeling: https://owasp.org/www-community/Threat_Modeling
- OWASP Threat Dragon: https://owasp.org/www-project-threat-dragon/
- OWASP Threat Modeling Project: https://owasp.org/www-project-threat-modeling/

## Required Threat Models

Create threat models for:

```text
auth/session lifecycle
tenant isolation
connector credential storage
connector runtime/network egress
source ingestion/raw payloads
summary/LLM pipeline
webhook delivery
admin/ops console
billing/cost ledger
compliance deletion pipeline
```

## Main Threats

```text
tenant data leakage
connector credential leakage
prompt injection from source content
provider SDK compromise
replay/backfill cost explosion
deleted source content reappearing after restore
queue replay causing duplicate billing/summaries
source policy/API change breaking ingestion
malicious webhook payloads
admin/operator misuse
```

## Required Controls

- tenant guards everywhere;
- RLS readiness;
- audit log append-only;
- idempotency keys;
- outbox/inbox;
- signed webhooks;
- connector sandboxing;
- secret manager/KMS;
- prompt isolation;
- cost preflight/reservation;
- backup deletion replay;
- feature flags for connector rollout;
- provider quarantine.

## Threat Review Triggers

Run a threat review when changing:

- auth/session model;
- tenant authorization;
- connector credential handling;
- raw payload storage;
- LLM/prompt/tool behavior;
- webhook signing;
- admin permissions;
- deletion/compliance logic.

## Locked Decisions

1. Threat models are stored in repo docs.
2. Security-sensitive boundary changes require threat review.
3. Connector runtime and LLM pipeline are explicit threat-model targets.
4. Prompt injection is a first-class threat.
5. Deleted data resurrection after restore is a first-class threat.

