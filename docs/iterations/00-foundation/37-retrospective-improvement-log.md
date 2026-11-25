# Iteration 00 - Retrospective Improvement Log

## Retrospective Goal
Capture whether the foundation work made implementation clearer, safer and more executable.

## What Worked
- Product loop was explicit enough to drive later iteration planning.
- Bounded contexts reduced ambiguity around ownership.
- Source acquisition policy prevented unsafe production assumptions.

## What To Improve
- Tighten any glossary terms that developers still interpret differently.
- Convert unresolved assumptions into dated decisions before Iteration 01.
- Add examples for contract standards where reviewers asked repeat questions.

## Architecture Lessons
- Multi-tenancy must be modeled from the start even for personal MVP usage.
- Source strategy decisions affect domain and operations, not just adapters.
- Contract standards are part of architecture, not documentation polish.

## Edge Cases Found
- Desired source is blocked by policy or unclear ToS.
- A feature sounds local/personal but affects tenant isolation later.
- Team confuses source binding with source provider implementation.

## Carryover To Next Iteration
- Open questions about ORM, migration tool and tenant context go to Iteration 01.
- Any source-policy exception needs owner and risk classification.
- Any contract-standard gap must be resolved before code generation.
