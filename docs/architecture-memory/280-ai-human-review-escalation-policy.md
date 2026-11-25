# 280 - AI Human Review Escalation Policy

## Decision

Most summaries are automated, but low-confidence, high-risk or policy-sensitive outputs require human review or explicit user-facing uncertainty.

The system must not pretend uncertain AI output is authoritative.

## Sources

- NIST AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework
- NIST Generative AI Profile NIST AI 600-1: https://www.nist.gov/itl/ai-risk-management-framework
- ISO/IEC 42001 AI management systems: https://www.iso.org/standard/42001
- OWASP LLM Top 10, misinformation and sensitive disclosure: https://owasp.org/www-project-top-10-for-large-language-model-applications/

## Escalation Triggers

Escalate when:

- citation validation fails
- model reports insufficient evidence
- source content is highly conflicting
- summary includes legal/financial/medical/security-sensitive implications
- prompt-injection detector/policy flags source material
- redaction uncertainty exists
- tenant requires review by policy
- output quality score below threshold

## Review States

```text
not_required
queued
in_review
approved
rejected
needs_regeneration
published_with_uncertainty
```

## Reviewer Scope

Personal MVP:

- user is reviewer for their own summaries
- flagged outputs show uncertainty and source citations

Multi-user/enterprise:

- tenant admin/reviewer role
- support staff only with approved support access
- audit log for review decisions

## UI Behavior

When review is required:

- do not send digest as final
- show pending review status
- allow source citation inspection
- allow regenerate/approve/reject where permitted

When uncertainty remains:

- label summary as uncertain
- show evidence gaps
- avoid strong claims

## Audit

Record:

- summary id
- reviewer id
- decision
- reason
- timestamp
- prompt/schema/model version
- changed output if edited

## Non-Goals

- No hidden manual rewriting without audit.
- No using human feedback for model training unless explicitly governed.
- No support staff review of tenant content without approved access scope.

## Architecture Rule

Human review is a risk control, not a product failure.

Automation should know when to stop.
