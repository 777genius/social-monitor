# Iteration 00 - Sprint Review Demo Script

## Review Goal
Prove that the MVP foundations are explicit enough for implementation to start without hidden product, domain or source-policy assumptions.

## Demo Flow
1. Walk through the end-to-end MVP loop.
2. Show bounded context map and ownership rules.
3. Show source acquisition policy and risk classes.
4. Show contract/event standards.
5. Show first implementation tickets derived from these decisions.

## Evidence To Show
- Glossary and product loop are accepted.
- Context map has named owners.
- Source strategy separates official/open/provider paths from unsupported risky paths.
- Contract standards include versioning, idempotency and tenant scope.

## Edge Cases To Exercise
- A requested source is high-risk and cannot be used in production.
- A personal-use requirement still requires tenant-safe modeling.
- A contract change is requested before the implementation scaffold exists.

## Review Questions
- Can Iteration 01 start without redefining core vocabulary?
- Are source constraints clear enough to prevent unsafe adapter decisions?
- Are architecture guardrails strict enough to protect Clean Architecture?

## Accept Progress If
- No critical assumption is ownerless.
- No production source path depends on bypass behavior.
- First platform tickets are ready to cut.
