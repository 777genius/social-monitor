# Iteration 00 - Test Fixtures And Scenarios

## Purpose
Define the first reusable examples that later tests, contracts and tickets can reference.

## Core Fixtures
- Tenant with one workspace and one topic.
- Topic with HN, RSS and future social-source binding examples.
- Source policy matrix with allowed, restricted and blocked source strategies.
- Contract examples for REST request, REST error, event envelope and idempotency key.

## Happy Path Scenarios
- User creates workspace, topic and approved source binding.
- Source policy approves an open/public source for MVP.
- Contract owner approves versioned REST and event examples.

## Negative Scenarios
- Source request has no risk class.
- Topic example omits tenant/workspace ownership.
- Event example has no version or idempotency key.

## Edge Cases
- Personal-use tenant still requires tenant-safe modeling.
- Source is useful but production-blocked by policy.
- Same product term is used differently by backend and mobile.

## Regression Seeds
- Glossary snapshot.
- Context map snapshot.
- Source policy approval/rejection examples.
