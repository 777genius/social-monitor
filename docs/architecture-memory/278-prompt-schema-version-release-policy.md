# 278 - Prompt Schema Version Release Policy

## Decision

Prompts, output schemas and retrieval assembly rules are versioned release artifacts.

Changing a prompt is a product behavior change and must be tested like code.

## Sources

- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
- OpenAI Structured Outputs announcement: https://openai.com/index/introducing-structured-outputs-in-the-api/
- OpenAI Prompt Caching: https://platform.openai.com/docs/guides/prompt-caching
- OpenAPI Specification: https://spec.openapis.org/oas/

## Versioned Artifacts

Version:

- system prompt template
- developer instruction template
- source material assembly format
- output JSON schema
- citation policy
- model routing policy
- retrieval/selection policy
- safety/redaction policy

## Compatibility

Summary read models must record:

- prompt version
- schema version
- model id
- source window
- retrieval version

This allows comparing old and new summaries and debugging regressions.

## Structured Output Rule

Use provider structured-output features where available, but still validate with local schema validation.

Provider structured output is not a replacement for application validation.

## Prompt Cache Layout

Place stable content at the beginning:

- product role
- safety rules
- output schema description
- citation rules
- formatting rules

Place variable content at the end:

- tenant preferences
- topic
- source excerpts
- time window

This matches prompt-caching guidance and reduces cost/latency variance.

## Rollout

Prompt/schema changes use:

- eval run
- canary tenants or internal tenants
- old/new comparison
- rollback plan
- version pinning

Do not silently change prompts for all tenants without observability.

## Rollback

Rollback must be able to:

- pin previous prompt version
- keep previous schema parser
- preserve already generated summaries
- regenerate only if requested/needed

## Architecture Rule

Prompts are code.

Schemas are contracts.
