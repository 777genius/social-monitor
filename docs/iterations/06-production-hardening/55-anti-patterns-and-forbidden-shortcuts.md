# Iteration 06 - Anti-Patterns And Forbidden Shortcuts

## Purpose
Prevent hardening from becoming documentation-only instead of enforceable beta safety.

## Forbidden Shortcuts
- Launching beta with known cross-tenant access.
- Logging provider credentials or sensitive headers.
- Treating CI contract checks as optional.
- Shipping without support-visible failure diagnostics.

## Architecture Anti-Patterns
- Security checks only at REST layer while workers bypass them.
- Quotas enforced only in UI.
- Observability that tracks infrastructure but not user-visible outcomes.

## Product Anti-Patterns
- Hiding limitations from beta users.
- Accepting cost risk without quota state.
- Treating support runbooks as post-launch work.

## Stop Immediately If
- Secret appears in logs/traces/errors.
- Breaking contract passes CI.
- Support needs shell access for common failures.
