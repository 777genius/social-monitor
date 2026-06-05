# Iteration 02 - Production Readiness Gap Analysis

## Readiness Goal
Ensure ingestion is reliable enough for summaries and beta users without pretending every future source is ready.

## MVP-Ready Areas
- HN/RSS/fake providers are implemented.
- Connector certification exists.
- Normalized feed schema is stable.
- Cursor behavior is defined.
- Provider errors are classified.

## Acceptable MVP Gaps
- Reddit, X/Twitter and Telegram can remain future adapters.
- Advanced source ranking can be deferred.
- Provider-specific dashboards can be simplified initially.

## Blocking Gaps
- Source adapter is not policy-approved.
- Feed schema requires provider-specific downstream logic.
- Cursor behavior is unsafe under crash/retry.
- Connector certification is missing.

## Owner Actions
- Ingestion lead fixes provider-port and schema gaps.
- QA owner expands certification fixtures.
- Source policy owner reviews source-risk gaps.
- Operations owner confirms failure visibility.

## Follow-Up
Carry future-source work forward only through adapter capability profiles, not through core ingestion changes.
