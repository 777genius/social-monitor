# 96. Risk Register

## Status

Locked for architecture baseline.

## Research Anchors

- NIST Cybersecurity Framework: https://www.nist.gov/cyberframework
- NIST AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework
- NIST Privacy Framework: https://www.nist.gov/privacy-framework

## Decision

Maintain a living risk register from the beginning. Architecture decisions are incomplete unless the major risks have owners and review dates.

## Risk Format

Each risk must include:

- id;
- title;
- category;
- affected capabilities;
- likelihood;
- impact;
- current controls;
- gaps;
- owner;
- review date;
- status;
- accepted/mitigated/transferred/avoided decision.

## Initial Categories

| Category | Examples |
|---|---|
| Source access | API pricing changes, quota reduction, account suspension, source terms changes |
| Legal/privacy | personal data overcollection, deletion gaps, unsupported regions |
| AI | hallucinated summaries, prompt injection, unsafe recommendations, untraceable decisions |
| Security | broken object-level authorization, credential leaks, webhook abuse, SSRF |
| Reliability | queue backlog, provider outage, retry storm, storage lifecycle failure |
| Cost | LLM overuse, uncontrolled backfill, high-cardinality observability costs |
| Product | noisy alerts, poor relevance, confusing source setup |
| Vendor | provider lock-in, contract mismatch, SLA gaps |

## Governance

Review cadence:

- weekly while building MVP;
- monthly after stable beta;
- immediately after any major incident, source policy change or provider pricing change.

Every high risk needs either mitigation work or explicit acceptance. "We know about it" is not a risk decision.

## Best-Fact Choice

NIST frameworks converge on governance, risk ownership and continuous review. For this product, source access, AI and privacy risks must be first-class, not afterthoughts.

