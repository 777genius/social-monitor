# Iteration 02 - Master Implementation Sequence

## PR Slice Rule
- One PR should change one provider/platform slice: SDK, certification, fake provider, HN, RSS, scheduler or feed/dedupe.
- Each PR must include provider failure and idempotency evidence when relevant.
- Split if a source adapter change also changes feed domain or summary behavior.

## Step 1 - Open Control Docs
- Read connector SDK policy, first sprint ticket cut and test fixtures.
- Confirm ingestion, source policy, feed schema and QA owners.
- Check source policy and cursor blockers.

## Step 2 - Cut Tickets
- Create SourceProviderPort ticket.
- Create capability profile ticket.
- Create source readiness profile ticket.
- Create certification suite ticket.
- Create fake provider ticket.
- Create HN/RSS adapter tickets.
- Create scheduler/cursor ticket.
- Create source health/status API ticket.
- Create future-source readiness records ticket for Reddit, X/Twitter, Telegram, GitHub and YouTube.

## Step 3 - Execute In Order
- Build provider port before adapters.
- Build certification before production source adapters.
- Build fake provider before external provider tests.
- Implement HN/RSS only after policy and certification are ready.
- Build cursor crash/retry tests before enabling scheduled scans.
- Build source health mapping before exposing provider failures to users.
- Keep future sources as readiness records until source approval, fixtures and adapter certification are ready.

## Step 4 - Validate
- Run connector certification.
- Verify normalized feed snapshots.
- Verify cursor crash/retry behavior.
- Confirm no provider-specific downstream fields.
- Verify source binding disable/pause behavior during queued and leased jobs.
- Verify repeated scans with HN/RSS do not duplicate feed items.
- Verify same public item does not leak state across tenants.

## Step 5 - Close
- Fill final go/no-go.
- Handoff normalized feed contract and provenance to summaries.
- Promote only when summary work can remain provider-neutral.
- Record unsupported/future sources as readiness profiles with state, risk and next decision trigger.
