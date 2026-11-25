# 149. Incident Communication and Status Page

## Status

Locked for incident management baseline.

## Research Anchors

- Atlassian incident communication: https://www.atlassian.com/incident-management/incident-communication/
- Atlassian incident response handbook: https://www.atlassian.com/incident-management/handbook/incident-response
- Statuspage incident communication tips: https://support.atlassian.com/statuspage/docs/incident-communication-tips/

## Decision

Prepare internal and external incident communication before production. A status page or equivalent becomes required before paid SaaS launch.

## Channels

| Audience | Channel |
|---|---|
| responders | incident chat + video bridge |
| internal stakeholders | internal status updates |
| customers | public/private status page |
| high-value tenants | email or account channel |
| support | incident notes and customer impact summary |

## Rules

- Incident commander owns response coordination.
- Communications owner owns status updates.
- External updates use confirmed impact, not speculation.
- Updates are timestamped and preserved.
- Security/privacy-sensitive details are withheld from public updates.
- Post-incident summary links impact, timeline, root cause and prevention work.

## Component Model

Status page components should map to user-visible capabilities:

- API;
- realtime updates;
- source ingestion;
- summaries/AI;
- notifications;
- dashboard/mobile app;
- source-specific degradation where appropriate.

## Best-Fact Choice

Incident communication is part of reliability. Transparent, timely updates reduce support load and preserve trust during provider/source outages.

