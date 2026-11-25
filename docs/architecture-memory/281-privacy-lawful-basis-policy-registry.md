# 281 - Privacy Lawful Basis Policy Registry

## Decision

Maintain a versioned processing-purpose registry that maps every data-processing purpose to lawful basis, jurisdiction, data classes, retention and user-facing disclosure.

Do not hardcode privacy assumptions into feature code.

## Sources

- ICO lawful basis guide: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/
- ICO legitimate interests guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/legitimate-interests/
- EDPB SME lawful processing guide: https://www.edpb.europa.eu/sme-data-protection-guide/process-personal-data-lawfully_en
- California CCPA/CPRA rights: https://www.oag.ca.gov/privacy/ccpa

## Registry Fields

```text
purpose_id
purpose_name
jurisdiction
data_categories
data_subject_categories
lawful_basis
legitimate_interest_assessment_uri
consent_required
contract_required
retention_policy_id
processor/subprocessor list
user_disclosure_key
last_reviewed_at
owner
```

## Core Purposes

Initial purposes:

- account authentication
- tenant administration
- source connection
- source monitoring
- normalized feed storage
- summary generation
- digest/notification delivery
- audit/security logging
- support access
- billing/metering
- product analytics

## Consent vs Legitimate Interest

Consent is used only where the user has a genuine choice and withdrawal can be honored.

Legitimate interest requires a documented assessment where applicable:

- purpose test
- necessity test
- balancing test

Do not use legitimate interest as a catch-all.

## CCPA/CPRA Mapping

For California users, privacy notices must map product data handling to rights such as:

- know/access
- delete
- correct
- opt out of sale/share where applicable
- limit sensitive personal information where applicable
- non-discrimination

The product should avoid sale/share of personal information by design.

## Architecture Boundary

Use:

```text
PrivacyPolicyPort.getPurposePolicy(purposeId, tenant, jurisdiction)
```

Feature code asks the policy service/registry, not local constants.

## Evidence

Each data flow must be traceable to:

- purpose
- lawful basis
- retention rule
- disclosure text
- vendor/subprocessor
- audit event where appropriate

## Architecture Rule

Privacy compliance is metadata plus enforcement.

If a purpose is not registered, processing is not production-ready.
