# 293 - Tenant Lifecycle Onboarding Offboarding

## Decision

Tenant lifecycle is an explicit state machine from creation through offboarding and deletion.

Do not treat tenant rows as simple CRUD.

## Sources

- NIST CSF 2.0: https://www.nist.gov/cyberframework
- ISO/IEC 27001 overview: https://www.iso.org/standard/27001
- SOC 2 Trust Services Criteria: https://www.aicpa-cima.com/resources/landing/trust-services-criteria

## Tenant States

```text
created
onboarding
active
payment_attention
suspended
offboarding
deletion_pending
deleted
legal_hold
```

State transitions must be audited.

## Onboarding Steps

Minimum:

- create tenant
- create owner membership
- select plan/trial
- configure region/residency default
- accept product/source terms
- create first topic
- connect first source
- configure scan policy
- configure notification preferences

## Suspension

Suspension may be caused by:

- payment failure
- abuse/fraud
- legal/compliance issue
- security incident
- user request

Suspension behavior:

- stop new scans
- stop expensive AI work
- preserve data
- allow owner/admin to resolve issue where appropriate
- keep security/audit logging

## Offboarding

Offboarding includes:

- disable source scans
- revoke source credentials
- disable API keys
- stop webhooks
- export data if requested/allowed
- apply retention/deletion schedule
- close billing state
- preserve audit/legal records as required

## Deletion

Deletion must fan out to:

- Postgres tenant data
- object storage raw payloads
- search/vector projections
- analytics exports
- mobile push tokens
- webhook endpoints
- support notes where allowed

Backups follow backup retention/deletion evidence policy.

## Architecture Rule

A tenant has operational state, legal state and billing state.

All three must be coordinated.
