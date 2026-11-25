# Incident Response, SLOs & SRE Policy

Date: 2026-05-31
Status: baseline SRE memory

## Decision

Define source-specific SLOs and incident classes. Do not use one global uptime promise for all sources.

References:

- NIST SP 800-61 Rev. 3: https://csrc.nist.gov/pubs/sp/800/61/r3/final
- Google SRE Error Budget Policy: https://sre.google/workbook/error-budget-policy/
- Google SRE Toil: https://sre.google/sre-book/eliminating-toil/

## Draft SLOs

HN:

- 99% scheduled scans complete within 5 minutes.

RSS:

- 99% scheduled scans complete within 15 minutes.

Reddit:

- 95% scheduled scans complete within scan window.
- 99% quota/backoff respected.

X:

- cost-bounded freshness only.
- no realtime promise until paid/API strategy is proven.

Summaries:

- 95% digest summaries ready before digest send window.
- 99.5% structured output schema validity.

Compliance:

- P0 priority.
- deletion/tombstone jobs outrank enrichment/backfill.

## Incident Classes

P0:

```text
tenant isolation breach
credential leak
compliance deletion failure
data loss
billing/cost runaway
```

P1:

```text
Reddit/X connector outage
Kafka/RabbitMQ severe lag
summary generation outage
broken digest delivery
```

P2:

```text
single provider degraded
delayed scans
elevated summary schema failures
```

## Runbook Shape

Each runbook includes:

- symptoms;
- dashboards;
- first checks;
- mitigation;
- rollback;
- user impact;
- data repair steps;
- post-incident actions.

## Kill Switches

Required:

- disable source;
- disable provider;
- pause tenant expensive ops;
- pause backfill;
- pause summaries;
- force compliance queue priority;
- quarantine connector version.

## Toil Policy

Any manual operation repeated more than twice should become:

- runbook step;
- admin action;
- automation;
- alert tuning;
- product fix.

Metrics:

```text
manual_intervention_count
dlq_manual_replay_count
connector_quarantine_manual_count
summary_manual_regeneration_count
compliance_manual_resolution_count
```

## Locked Decisions

1. SLOs are source-specific.
2. Compliance deletion is P0.
3. X gets cost-bounded freshness, not hard realtime promise.
4. Every P0/P1 incident needs a runbook.
5. Repeated manual work becomes automation/admin tooling or a product fix.

