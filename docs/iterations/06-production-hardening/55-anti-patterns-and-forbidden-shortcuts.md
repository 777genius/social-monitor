# Iteration 06 - Anti-Patterns And Forbidden Shortcuts

## Purpose
Prevent hardening from becoming documentation-only instead of enforceable beta safety.

## Forbidden Shortcuts
- Launching beta with known cross-tenant access.
- Logging provider credentials or sensitive headers.
- Treating CI contract checks as optional.
- Adding a release gate script without wiring it into `npm run verify`.
- Shipping without support-visible failure diagnostics.

## Architecture Anti-Patterns
- Security checks only at REST layer while workers bypass them.
- Quotas enforced only in UI.
- Observability that tracks infrastructure but not user-visible outcomes.
- Feature use cases without focused sibling specs.
- Formal sibling specs that do not reference the actual use case.
- Committed `.only` or `.skip` tests.
- Feature use cases throwing `DomainError` instead of returning `Result`.
- Feature use cases instantiating concrete adapters instead of depending on ports.
- REST controllers that rely on caller discipline instead of `requireTenantScope(...)`.
- Production `console.*` logging instead of structured logging.

## Product Anti-Patterns
- Hiding limitations from beta users.
- Accepting cost risk without quota state.
- Treating support runbooks as post-launch work.

## Stop Immediately If
- Secret appears in logs/traces/errors.
- Breaking contract passes CI.
- Support needs shell access for common failures.
- `npm run check:code-quality` fails.
- `npm run check:release` reports a required gate missing from `npm run verify`.
- A new feature use case is merged without a sibling `*.use-case.spec.ts`.
- A test is committed with `.only` or `.skip`.
