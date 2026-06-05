# Iteration 03 - Edge Case Playbook

## Scenario - Summary Claim Has No Evidence

- Signal: Output contains uncited factual statement.
- Validate: Citation coverage check.
- Mitigation: Reject output, retry or show failed summary status.

## Scenario - Provider Returns Malformed Structured Output

- Signal: JSON/schema validation fails.
- Validate: Malformed provider response test.
- Mitigation: Retry with bounded policy; persist actionable failure after limit.

## Scenario - Feed Exceeds Context Window

- Signal: Too many candidate items for model input.
- Validate: Large feed fixture.
- Mitigation: Cluster, rank and summarize in chunks with evidence preservation.

## Scenario - Cost Spike

- Signal: Token/cost telemetry crosses tenant/topic threshold.
- Validate: Cost simulation.
- Mitigation: Enforce budget, lower frequency or use cheaper model profile.

## Scenario - Prompt Injection In Source Item

- Signal: Summary follows instructions embedded in source content.
- Validate: adversarial fixture with source text attempting to override system/developer instructions.
- Mitigation: delimit source content as evidence, keep prompt variables whitelisted and block promotion if instruction integrity fails.

## Scenario - Valid JSON With Invalid Citation

- Signal: Schema passes but citation id is missing, cross-tenant or irrelevant.
- Validate: provider fixture with valid shape and invalid citation ids.
- Mitigation: run business citation validator after schema validation and before completed state.

## Scenario - New Evidence Arrives During Summary

- Signal: User sees summary that omits newly scanned important item.
- Validate: freeze evidence window, add feed item during provider call, then complete job.
- Mitigation: complete against frozen window and mark stale/freshness state when newer evidence exists.

## Scenario - Feedback Reports Wrong Fact

- Signal: user marks summary as wrong but artifact is already completed.
- Validate: submit feedback with field reference and free text.
- Mitigation: store feedback separately, do not edit original artifact, convert eligible feedback to eval fixture and offer regenerate.

## Scenario - Source Policy Disallows AI

- Signal: source items are summarized despite capability/profile saying AI summarization is not allowed.
- Validate: evidence selection fixture with disallowed source binding.
- Mitigation: exclude disallowed items, record limited_sources/source_policy flag or fail request when no allowed evidence remains.

## Scenario - Repair Changes Meaning

- Signal: malformed JSON repair produces valid schema but altered claim/citation meaning.
- Validate: fixture where repair changes cited fact.
- Mitigation: allow only bounded repair and rerun full business validation; store original failed attempt metadata safely.
