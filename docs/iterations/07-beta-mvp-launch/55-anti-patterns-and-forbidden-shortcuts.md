# Iteration 07 - Anti-Patterns And Forbidden Shortcuts

## Purpose
Prevent beta launch from becoming uncontrolled feature expansion.

## Forbidden Shortcuts
- Adding unsupported sources during launch.
- Launching without rollback/pause owner.
- Treating anecdotal feedback as roadmap proof.
- Hiding known limitations from beta users.

## Architecture Anti-Patterns
- Beta feedback creating cross-context shortcuts.
- Source expansion bypassing capability profile and policy.
- Post-MVP roadmap ignoring ADRs and quality gates.

## Product Anti-Patterns
- Measuring beta only by feature requests.
- Prioritizing source count over reliability and trust.
- Expanding scope before onboarding works.

## Stop Immediately If
- User cannot complete core onboarding.
- Launch cannot be paused safely.
- Feedback has no owner, category or evidence.
