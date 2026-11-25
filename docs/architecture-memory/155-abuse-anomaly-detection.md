# 155. Abuse and Anomaly Detection

## Status

Locked for security/product baseline.

## Research Anchors

- OWASP Automated Threats to Web Applications: https://owasp.org/www-project-automated-threats-to-web-applications/
- OWASP Bot Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Bot_Management_Cheat_Sheet.html
- OWASP API Security Top 10: https://owasp.org/API-Security/editions/2023/en/0x00-header/

## Decision

Detect abuse of this product's APIs, accounts, webhooks, trials and expensive workloads. Do not implement or document bypasses of third-party bot detection systems.

## Abuse Signals

Track:

- signup/login bursts;
- credential stuffing indicators;
- API key abuse;
- high failed auth rate;
- abnormal source binding churn;
- excessive backfill requests;
- LLM budget spikes;
- webhook delivery attacks;
- topic/rule patterns indicating spam or prohibited use;
- cross-tenant authorization denials;
- unusual export/delete request patterns.

## Response Actions

Possible actions:

- rate limit;
- require reauthentication/MFA;
- disable API key;
- pause tenant source scans;
- block backfill;
- require billing verification;
- route to manual review;
- suspend tenant with audit reason.

## Detection Design

- Use low-cardinality metrics for aggregate alerting.
- Use security logs for investigation.
- Store abuse decisions with reason codes.
- Avoid fully automated irreversible account deletion.
- Keep appeal/manual review path for false positives.

## Best-Fact Choice

Abuse controls protect reliability and cost. They must be tenant-aware and workload-aware because expensive AI/source operations are more damaging than normal read API traffic.

