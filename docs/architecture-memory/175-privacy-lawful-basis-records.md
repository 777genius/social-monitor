# 175. Privacy Lawful Basis Records

## Status

Locked for privacy governance baseline.

## Research Anchors

- European Commission lawful processing grounds: https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/legal-grounds-processing-data/grounds-processing/when-can-personal-data-be-processed_en
- ICO lawful basis guide: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/
- EDPB information to individuals: https://www.edpb.europa.eu/sme-data-protection-guide/faq-frequently-asked-questions/answer/what-information-should-i_en

## Decision

Track lawful basis and purpose metadata for personal-data processing activities before expanding beyond personal use. This is documentation plus system metadata where processing behavior depends on it.

## Processing Records

For each processing purpose record:

- purpose id;
- data classes;
- lawful basis;
- legitimate interest note where applicable;
- consent requirement where applicable;
- retention period;
- data subjects affected;
- subprocessors/providers;
- user-facing disclosure location;
- owner;
- review date.

## Product Purposes

Initial purposes:

- account creation/authentication;
- tenant/team administration;
- source connection and monitoring;
- topic/rule configuration;
- feed/search/summarization;
- notifications;
- billing/entitlements;
- security/abuse prevention;
- support/admin operations;
- analytics/product improvement.

## Consent Boundary

Do not use consent as a convenient default. Use consent only where it is genuinely appropriate and revocable without breaking necessary service operation. For contractual service delivery, legitimate interests or contract may be more appropriate depending on jurisdiction and legal review.

## Best-Fact Choice

Legal basis is not only a privacy-policy sentence. It drives retention, deletion, user controls, disclosures and whether a feature can process certain data at all.

