# Iteration 00 - Engineering Kickoff Agenda

## Meeting Goal
Align the product, architecture and source-policy foundations before any implementation ticket is opened.

## Required Attendees
- Product owner.
- Backend architecture owner.
- Mobile architecture owner.
- Source policy owner.
- Delivery owner.

## Agenda
1. Confirm the MVP loop: workspace -> topic -> source binding -> scan -> feed -> summary -> delivery.
2. Confirm bounded contexts and ownership.
3. Confirm source acquisition policy and risk classes.
4. Confirm contract standards for REST, events and internal RPC.
5. Confirm documentation and ticket quality rules.

## Decisions To Lock
- Which source strategies are allowed for production.
- Which MVP entities become core domain objects.
- Which contracts must exist before backend/mobile implementation.
- Which assumptions must be validated before Iteration 01.

## Edge Cases To Discuss
- A source is desirable but high-risk or ToS-unclear.
- A feature looks personal-use-only but affects future tenancy.
- A contract is useful but not yet backed by a real adapter.
- Product scope expands before architecture boundaries are stable.

## First-Day Output
- Approved context map.
- Approved source policy.
- Approved contract rules.
- First Iteration 01 tickets can be created without hidden assumptions.
