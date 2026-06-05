# 283 - Data Residency Transfer Impact Policy

## Decision

Data residency and cross-border transfer rules are tenant policy inputs that affect storage, processing, AI provider selection and support access.

Do not assume all tenants can be processed in one global region.

## Sources

- GDPR international transfers overview, European Commission: https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection_en
- EDPB recommendations on supplementary measures: https://www.edpb.europa.eu/our-work-tools/our-documents/recommendations/recommendations-012020-measures-supplement-transfer_en
- ICO international transfers: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/
- NIST AI RMF: https://www.nist.gov/itl/ai-risk-management-framework

## Residency Policy Fields

```text
tenant_id
primary_region
allowed_processing_regions
allowed_ai_regions
allowed_support_regions
cross_border_transfer_basis
data_classes_in_scope
backup_regions
exception_approver
last_reviewed_at
```

## Regional Data Classes

Apply residency to:

- tenant account data
- source credentials
- normalized items
- raw payloads
- summaries
- exports
- audit logs
- AI prompts/outputs
- analytics events

## Processing Controls

Schedulers and routers must check:

- tenant residency policy
- provider processing region
- object storage bucket region
- database shard/region
- AI provider region/contract
- support access location

If no compliant route exists, fail closed with tenant-visible status.

## Transfer Impact Assessment

When data may cross regions/legal jurisdictions:

- identify exporter/importer
- identify data classes
- identify transfer mechanism
- assess government/access risks where required
- record supplementary measures
- record vendor controls

## Backups And Logs

Residency includes:

- backups
- telemetry/logs
- traces
- object storage replicas
- analytics exports
- support artifacts

Do not let observability quietly violate residency rules.

## MVP Policy

MVP can run in one region for personal use, but data model and configuration must not block future tenant-region assignment.

## Architecture Rule

Region is not just infrastructure.

It is a data-policy attribute.
