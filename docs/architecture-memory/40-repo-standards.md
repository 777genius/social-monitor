# Repository Standards

Date: 2026-05-31
Status: baseline repository standards memory

## Decision

Use consistent repository conventions so architecture decisions can be enforced in CI and code review.

## Commit & Release Conventions

Use Conventional Commits for commit messages when practical.

Use Keep a Changelog for human-readable release notes when releases begin.

Use semantic versioning for packages/contracts that declare a public API.

References:

- Conventional Commits: https://www.conventionalcommits.org/
- Keep a Changelog: https://keepachangelog.com/en/1.1.0/
- Semantic Versioning: https://semver.org/

## Required Repository Structure

```text
apps/
packages/
docs/
  architecture-memory/
  adr/
  contracts/
  runbooks/
  threat-model/
  compliance/
tools/
```

## Code Ownership

At minimum, define ownership by area:

```text
platform
ingestion
connectors
intelligence
frontend
security
ops
```

## PR Requirements

PRs touching high-risk areas must mention:

- risk class;
- tests run;
- migration impact;
- contract impact;
- rollout/rollback plan;
- observability impact.

High-risk areas:

- auth/session;
- tenant authorization;
- connector credentials;
- source connectors;
- schema contracts;
- DB migrations;
- summary prompts/models;
- billing/cost logic;
- compliance/deletion.

## CI Required Checks

- typecheck;
- lint;
- unit tests;
- integration tests for touched persistence/messaging code;
- OpenAPI diff;
- event/protobuf compatibility;
- migration check;
- connector certification when connector touched;
- summary eval when prompt/model touched.

## Locked Decisions

1. Repo standards are used to enforce architecture, not just style.
2. Conventional Commits are preferred.
3. Public contract packages use SemVer.
4. High-risk PRs require rollout/rollback notes.
5. CI gates architecture boundaries and contract compatibility.

