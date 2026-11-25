# Iteration 02 - Engineering Kickoff Agenda

## Meeting Goal
Start ingestion with reliable, policy-compliant connectors and a certified adapter model.

## Required Attendees
- Ingestion lead.
- Backend lead.
- Source policy owner.
- QA owner.
- Operations representative.

## Agenda
1. Confirm supported MVP sources: HN and RSS first.
2. Confirm SourceProviderPort shape and capability profile.
3. Confirm scheduler, cursor and worker lease behavior.
4. Confirm provider error taxonomy.
5. Confirm connector certification test suite.

## Decisions To Lock
- Normalized feed item schema.
- Cursor commit semantics.
- Retry/backoff and dead-letter behavior.
- Which source risks block production use.

## Edge Cases To Discuss
- Provider returns duplicate or reordered items.
- Cursor advances before durable persistence.
- User config creates overlapping scans.
- A source adapter cannot provide stable item IDs.

## First-Day Output
- Connector port ticket is ready.
- Fake provider test harness is defined.
- HN/RSS adapter tickets have acceptance criteria.
- Worker idempotency requirements are clear.
