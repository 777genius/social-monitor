# Iteration 00 - Edge Case Playbook

## Scenario - Source Works Technically But Is Not Production-Safe

- Signal: Connector proposal depends on fragile access, unmanaged accounts or bypass behavior.
- Validate: Check source risk class and provider terms/reliability.
- Mitigation: Move source to research/future list; require official/open/provider path.

## Scenario - Bounded Context Overlap

- Signal: Two contexts both want to own the same aggregate.
- Validate: Identify who creates, mutates and enforces invariants.
- Mitigation: Pick one owner; other contexts consume events or read models.

## Scenario - MVP Scope Creep

- Signal: New source or feature does not improve the core loop.
- Validate: Map request to workspace -> topic -> source -> scan -> feed -> summary -> delivery.
- Mitigation: Move to roadmap unless it unblocks the core loop.

## Scenario - Frontend And Backend Vocabulary Diverge

- Signal: Flutter feature names do not match bounded contexts.
- Validate: Compare feature list to context map.
- Mitigation: Rename feature or add explicit adapter language.
