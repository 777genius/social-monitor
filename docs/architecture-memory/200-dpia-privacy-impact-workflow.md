# 200. DPIA and Privacy Impact Workflow

## Status

Locked for privacy governance baseline.

## Research Anchors

- European Commission DPIA requirements: https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/obligations/when-data-protection-impact-assessment-dpia-required_en
- EDPB DPIA resources: https://www.edpb.europa.eu/our-work-tools/our-documents/topic/data-protection-impact-assessment-dpia_en
- ICO DPIA guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/

## Decision

Run privacy impact screening for new data features and full DPIA-style review for high-risk processing before production rollout.

## Triggers

Screen every feature that changes:

- personal data classes;
- source data collection scope;
- AI processing of user/source data;
- retention period;
- subprocessors/providers;
- cross-region transfer;
- export/delete behavior;
- admin/support access;
- analytics/tracking.

Full DPIA review when processing is likely high risk, large scale, sensitive, novel, or difficult for users to understand/control.

## Workflow

```text
feature proposal -> privacy screening -> data map update
-> risk assessment -> mitigations -> owner approval
-> DPO/legal review where needed -> release gate
-> post-launch review
```

## Outputs

- data classes and purposes;
- lawful basis;
- risks to users/tenants;
- mitigations;
- residual risk owner;
- user disclosure/control changes;
- subprocessor updates;
- review date.

## Best-Fact Choice

Privacy review must happen before architecture hardens. Retrofitting deletion, consent, retention and provider controls after launch is slower and riskier.

