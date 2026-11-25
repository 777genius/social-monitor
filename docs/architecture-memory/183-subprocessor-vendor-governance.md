# 183. Subprocessor and Vendor Governance

## Status

Locked for privacy/compliance baseline.

## Research Anchors

- EDPB processor obligations FAQ: https://www.edpb.europa.eu/sme-data-protection-guide/faq-frequently-asked-questions/answer/do-data-processors-also-have_en
- EDPB information to individuals: https://www.edpb.europa.eu/sme-data-protection-guide/faq-frequently-asked-questions/answer/what-information-should-i_en

## Decision

Maintain a vendor/subprocessor register before paid SaaS. Vendors that process tenant/user/source data require privacy, security and contractual review.

## Register Fields

Each vendor record includes:

- vendor name;
- service purpose;
- data classes processed;
- controller/processor/subprocessor role;
- regions;
- retention behavior;
- security evidence;
- DPA status;
- subprocessors link;
- breach notification terms;
- owner;
- review date.

## Vendor Classes

Review required for:

- LLM providers;
- email/push providers;
- analytics/crash reporting;
- cloud hosting/storage;
- payment provider;
- support/helpdesk;
- observability/logging;
- source acquisition providers.

## Change Workflow

- New vendor cannot receive production data before approval.
- Material vendor changes require documentation and, where needed, tenant notice.
- Vendors with sensitive/raw data access get stricter review and shorter review cadence.

## Best-Fact Choice

Subprocessor governance is not just legal paperwork. It determines what data may be sent where, for which purpose, and under which tenant promises.

