# Iteration 00 - Master Implementation Sequence

## PR Slice Rule
- One PR should lock one foundation decision group: glossary, context map, source policy, contract standard or closure rule.
- Each PR must leave future implementation tickets clearer than before.
- Split if the PR mixes product vocabulary, source policy and contract standards without one review owner.

## Step 1 - Open Control Docs
- Read overview, scope guardrails and sprint-zero bootstrap.
- Confirm owners for product, architecture, source policy and contracts.
- Check start blockers before any ticket is created.

## Step 2 - Cut Tickets
- Create glossary/product loop ticket.
- Create bounded context map ticket.
- Create source policy ticket.
- Create contract standards ticket.
- Create closure and ticket quality ticket.

## Step 3 - Execute In Order
- Lock vocabulary first.
- Lock context ownership second.
- Lock source policy third.
- Lock contract/event standards fourth.
- Create ADR seeds for durable decisions.

## Step 4 - Validate
- Run cross-functional review.
- Check value validation, anti-patterns and evidence register.
- Confirm risk burndown closeout criteria.

## Step 5 - Close
- Fill final go/no-go.
- Complete operational handoff.
- Promote only when Iteration 01 can start without redefining foundation decisions.
