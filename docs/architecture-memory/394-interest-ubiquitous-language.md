# Interest Ubiquitous Language

Date: 2026-06-29

## Decision

Use `Interest` as the core user-owned monitoring entity.

Do not use `Topic` for product/domain/API names when the entity belongs to a
workspace and represents what a user wants to follow.

## Language

- Interest - stable user information need inside a workspace.
- Interest brief - human-readable description of the interest.
- Interest search spec - normalized query/keywords used by acquisition.
- Interest coverage - how sources cover the interest.
- Source binding - concrete provider/source configuration attached to an interest.
- Signal or mention - normalized content item found by acquisition.
- Briefing - AI summary for an interest or workspace.

## Boundaries

`Interest` owns the product language. `Coverage` and `SourceBinding` own the
setup language. `Feed`, `Signals`, `Summaries`, `Briefings` and `Digests` consume
interest identifiers but do not rename them back to topics.

Valid external exceptions:

- GitHub repository `topics` remain provider-native metadata.
- X/Twitter topic-like search segments remain provider/source query language.
- Kafka/RabbitMQ topic exchange terminology remains protocol language.
- Topic clustering or NLP topic modeling may use `topic` only when it is not the
  user-owned monitoring entity.

## Consequences

- REST routes use `/interests`.
- API key scopes use `read:interests` and `write:interests`.
- Domain/application types use `Interest`, `interestId` and `interestIds`.
- Coverage planning uses `PlanInterestCoverage` and `InterestCoveragePlan`.
- Reader surfaces use `interestSections` and interest highlights.
- Physical storage uses `interests` and `interest_id` unless a compatibility
  migration temporarily dual-writes old columns.
