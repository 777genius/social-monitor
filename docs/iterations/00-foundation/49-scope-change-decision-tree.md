# Iteration 00 - Scope Change Decision Tree

## Decision Goal
Prevent foundation scope changes from weakening later architecture decisions.

## Accept Now If
- Change clarifies glossary or context ownership.
- Change makes source policy safer.
- Change makes contract standards more actionable.

## Defer If
- Change ranks future sources but does not affect MVP foundations.
- Change adds implementation detail better decided in Iteration 01.
- Change adds product polish outside the core loop.

## Escalate To ADR If
- Change affects bounded context boundaries.
- Change changes source acquisition policy.
- Change changes tenant or contract assumptions.

## Block If
- Change approves an unclassified source path.
- Change removes multi-tenancy from the model.
- Change makes contracts framework-specific.

## Required Record
- Decision owner.
- Reason.
- Impacted docs.
- Follow-up iteration or ticket.
