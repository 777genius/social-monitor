# 144. Multi-Region Readiness

## Status

Locked for reliability baseline.

## Research Anchors

- AWS Well-Architected Reliability Pillar: https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/welcome.html
- Google Cloud Well-Architected Framework: https://docs.cloud.google.com/architecture/framework

## Decision

Start single-region with multi-AZ managed services, but design data, config and deployment choices so disaster recovery and later multi-region are possible.

## Initial Position

Single active region is correct for MVP and early SaaS because:

- simpler consistency model;
- lower cost;
- easier source quota control;
- easier incident response;
- fewer data residency mistakes.

## Readiness Requirements

Even in single-region:

- IaC can recreate infrastructure in another region;
- backups are restorable in target region;
- DNS/failover plan exists;
- object storage replication option is understood;
- secrets can be restored/rotated;
- source credentials are not tied to one cluster;
- tenant region metadata exists before data residency promises.

## Future Constraints

Multi-region active-active requires:

- regional tenant placement;
- clear write ownership;
- conflict strategy;
- event replication semantics;
- regional source quota handling;
- privacy/data residency controls;
- region-aware support/admin access.

## Best-Fact Choice

Do not build active-active early. Do build the recovery path and avoid choices that make region recovery impossible.

