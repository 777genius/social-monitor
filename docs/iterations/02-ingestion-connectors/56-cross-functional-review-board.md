# Iteration 02 - Cross-Functional Review Board

## Review Goal
Approve ingestion behavior before summary intelligence consumes feed data.

## Required Reviewers
- Ingestion lead.
- Source policy owner.
- Backend lead.
- AI/summary lead.
- QA owner.
- Operations representative.

## Review Questions
- Are supported sources policy-approved?
- Can every adapter pass certification?
- Is normalized feed provider-neutral?
- Are cursors safe under retry and crash?
- Are scan failures visible to users/operators?

## Required Evidence
- Connector certification results.
- Capability profiles.
- Normalized feed samples.
- Cursor crash/retry evidence.
- Provider error taxonomy.

## Approval Rule
Promote only if summaries can consume feed items without source-specific assumptions.
