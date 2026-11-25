# Iteration 04 - Open Questions And Assumptions

## Working Assumptions

1. Flutter app uses feature-scoped Clean Architecture.
2. MobX stores are presentation orchestration only.
3. Generated REST clients are wrapped by infrastructure repositories/clients.
4. Headless components from `flutter_headless` are required.

## Open Questions

| Question | Owner | Deadline | Decision Impact |
| --- | --- | --- | --- |
| Which exact beta platform is first: Android, iOS, web or all? | Mobile/product | Before release setup | Build target |
| Which offline cache duration is acceptable? | Mobile/product | Before offline work | Stale UX |
| Which source status messages are user-facing? | Product/support | Before source UI | Failure states |
| Which summary feedback UI is MVP? | Product/mobile | Before summary screen | Feedback loop |

## Validation Rule

Do not treat a screen as complete until it handles loading, empty, error, stale and partial-success states.
