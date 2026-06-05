# 284 - Vendor DPA Subprocessor Governance

## Decision

Every vendor that receives tenant, user, source, telemetry or AI-processing data must have a vendor record, risk review and processing classification.

Do not add SDKs/providers without updating vendor governance.

## Sources

- GDPR processor obligations, European Commission: https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/obligations/processor_en
- ICO contracts and liabilities between controllers and processors: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/contracts-and-liabilities-between-controllers-and-processors/
- ISO/IEC 42001 overview: https://www.iso.org/standard/42001
- NIST AI RMF Generative AI Profile: https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence

## Vendor Record

```text
vendor_id
service_name
purpose
data_categories
processor/controller role
dpa_status
subprocessor_url
security_review_status
privacy_review_status
ai_review_status
regions
retention_terms
training_use_policy
breach_notice_terms
last_reviewed_at
owner
```

## Vendor Classes

Required classes:

- cloud provider
- database/object storage provider
- AI model provider
- email/push provider
- analytics/crash provider
- auth/identity provider
- observability provider
- payment provider
- source data provider/reseller

## AI Provider Review

For AI providers, record:

- whether inputs are used for training
- retention period
- data location
- abuse monitoring behavior
- enterprise privacy settings
- model/version lifecycle
- subprocessor chain
- deletion/export support

## Change Notifications

Vendor/subprocessor changes require:

- impact assessment
- tenant notification where contract requires
- opt-out/objection handling where applicable
- architecture memory update if material

## SDK Intake

Any new SDK must answer:

- what data leaves device/server
- where it goes
- why it is needed
- whether it collects telemetry
- how it is disabled
- whether it changes store privacy declarations

## Architecture Rule

Vendors are part of the system boundary.

If data leaves the platform, it must be governed.
