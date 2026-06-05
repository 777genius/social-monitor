# 294 - Incident Status Communication Policy

## Decision

Incident communication is prepared before incidents happen.

Status updates must be timely, precise, consistent and audience-aware.

## Sources

- NIST SP 800-61r2 Incident Handling Guide: https://csrc.nist.gov/pubs/sp/800/61/r2/final
- Atlassian incident communication best practices: https://www.atlassian.com/incident-management/incident-communication/
- Atlassian Statuspage communication tips: https://support.atlassian.com/statuspage/docs/incident-communication-tips/
- Google SRE incident response: https://sre.google/sre-book/emergency-response/

## Communication Channels

Prepare:

- public status page
- in-app status banner
- email notifications
- support macro/templates
- internal incident channel
- executive/legal/security escalation channel

Status page is the primary public source of truth for service availability incidents.

## Incident Audience

Audiences:

- on-call responders
- support team
- internal employees
- affected tenants
- all customers
- vendors/providers
- legal/security/privacy stakeholders

Messages are tailored but must not contradict each other.

## Update Cadence

Initial acknowledgment:

- as soon as customer impact is confirmed or strongly suspected

Ongoing:

- severe incidents: at least every 30-60 minutes
- lower severity: cadence stated in the update

Always include expected next update time when practical.

## Message Content

Include:

- known impact
- affected components/sources
- start time if known
- current mitigation
- next update time
- security/data-loss statement if known

Avoid:

- speculation
- blame-shifting to vendors
- internal-only technical details
- unsupported ETA promises

## Source Provider Incidents

If Reddit/X/OpenAI/Stripe/etc. cause user-visible impact, communicate platform impact clearly.

Users experience it as product degradation even when root cause is external.

## Architecture Rule

During incidents, silence creates support load and trust loss.

Communicate early, then refine as facts improve.
