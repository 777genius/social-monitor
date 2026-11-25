# Iteration 04 - Master Implementation Sequence

## PR Slice Rule
- One PR should change one mobile slice: shell, generated client wrapper, topic, source binding, feed/summary or state coverage.
- Each PR must keep DTOs out of domain and MobX stores out of business rules.
- Split if visual polish is bundled with generated client, domain mapper or store behavior changes.

## Step 1 - Open Control Docs
- Read mobile overview, developer playbook and test scenarios.
- Confirm Flutter, API, product, design/system and QA owners.
- Check OpenAPI and feature-boundary blockers.

## Step 2 - Cut Tickets
- Create Flutter shell ticket.
- Create generated client wrapper ticket.
- Create topic feature ticket.
- Create source binding feature ticket.
- Create feed/summary feature ticket.
- Create UI state and store test ticket.

## Step 3 - Execute In Order
- Create shell and dependency registration first.
- Wrap generated client before features consume it.
- Implement topic and source binding before feed/summary.
- Add failure states before polish.

## Step 4 - Validate
- Run analyze, mapper tests and store tests.
- Walk through core loop.
- Verify DTO/domain boundary and citation drill-down.

## Step 5 - Close
- Fill final go/no-go.
- Handoff store and UI-state contracts to realtime.
- Promote only when realtime can integrate without bypassing feature architecture.
