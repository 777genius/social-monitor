# Subscription Runtime Rate-Limit Capacity

## Decision

Social Monitor uses the pinned subscription-runtime artifact as the sole owner
of Codex App Server rate-limit capacity state. The runtime combines:

- `account/rateLimits/read` on a bounded TTL;
- `account/rateLimits/updated` push invalidation;
- the shared capacity store for cooldown and exhausted-account exclusion;
- typed account failover before a task reaches `thread/start` or `turn/start`.

The Social Monitor wrapper must emit redacted structured lifecycle and failure
events. It must not log prompts, auth material, cookies or provider payloads.

## Production Invariants

1. The runtime artifact version and SHA-256 are pinned in repository provenance.
2. A capacity-rejected account cannot start the user task.
3. Retry selects another eligible account without replaying a completed turn.
4. Real user projects are never used for runtime smoke tests.
5. Production activation uses the reviewed signed-transition workflow; manual
   marker edits and container-only deploys are not acceptable evidence.

## Evidence

- subscription-runtime release: `0.1.0-main.30`;
- artifact SHA-256: `fc404779152c41718c55e0a7ba35fcc5ba888391f467207bfd21cc6740b22f0a`;
- Social Monitor integration: PR `#267`;
- deploy resume correction: PR `#268`.
