# 292 - Abuse Fraud Resource Consumption Controls

## Decision

Abuse controls are mandatory because source scanning, AI summaries, exports and webhooks can create direct provider cost and platform load.

Controls must prevent broken object access, quota bypass and unrestricted resource consumption.

## Sources

- OWASP API Security Top 10 2023: https://owasp.org/API-Security/
- OWASP API Developer Guide: https://devguide.owasp.org/en/07-training-education/07-api-top-ten/
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- NIST CSF 2.0: https://www.nist.gov/cyberframework

## Abuse Surfaces

High-risk surfaces:

- topic rule creation
- scan interval changes
- source binding creation
- historical backfill
- AI summary generation
- exports
- webhook replay
- public API keys
- invitation/member management

## BOLA Controls

Every resource-id endpoint must enforce:

- tenant ownership
- user membership
- permission
- object state visibility
- support scope if internal actor

Do not infer authorization from URL structure or client-provided tenant id.

## Resource Consumption Controls

Required:

- request body limits
- pagination limits
- source query complexity estimate
- scan interval minimum
- max pages/items per scan
- max AI tokens per request
- export size limits
- webhook retry caps
- per-tenant concurrency caps

## Fraud Signals

Track:

- sudden topic/source creation spikes
- high failed auth/source credential attempts
- repeated quota-exceeded attempts
- many tenants from same payment/device/IP pattern
- high AI cost per tenant
- webhook endpoints returning suspicious patterns
- API keys with unusual usage

## Response Actions

Actions:

- warn
- throttle
- require verification
- pause expensive features
- suspend tenant
- revoke API key
- require billing review
- escalate to security incident

All actions are auditable.

## Architecture Rule

Cost abuse is reliability abuse.

Controls must run before expensive work starts.
