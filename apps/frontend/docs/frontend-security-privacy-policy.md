# Frontend Security And Privacy Policy

## Purpose

Social Monitor handles social/provider data, workspace identity and source credential repair flows.
The frontend must be privacy-safe before feature code grows.

Related architecture memory:

- Mobile secure storage: `../../../docs/architecture-memory/176-mobile-secure-storage-policy.md`
- Mobile secure storage threat model: `../../../docs/architecture-memory/246-mobile-secure-storage-threat-model.md`
- Log redaction: `../../../docs/architecture-memory/71-log-redaction-secrets-scanning.md`
- Safe content rendering: `../../../docs/architecture-memory/65-safe-content-rendering.md`
- Source credentials: `../../../docs/architecture-memory/24-source-credentials-oauth.md`
- Data classification: `../../../docs/architecture-memory/20-data-classification-export.md`

## Data Classes

Public UI data:

- product labels;
- non-sensitive status labels;
- generic documentation links.

Workspace data:

- tenant/workspace ids;
- workspace display names;
- user role and permissions.

Provider data:

- post/comment text;
- author handles;
- URLs;
- source ids;
- provider metadata.

Credential data:

- access tokens;
- refresh tokens;
- API keys;
- OAuth codes;
- credential health details.

Credential data is never stored or logged by feature code.

## Local Storage Policy

Allowed by default:

- UI preferences;
- non-sensitive feature flags/capability snapshot;
- in-memory cache of read models;
- short-lived route/workflow state.

Requires ADR and privacy review:

- persistent read-model cache;
- secure token storage;
- offline provider content;
- screenshots or diagnostics bundles;
- analytics identity storage.

Forbidden in frontend feature code:

- source credentials;
- provider API keys;
- raw provider payload dumps;
- raw social content fixtures;
- user email/name in logs or crash user id.

## Rendering Provider Content

Provider content is untrusted.

Rules:

- render as text unless a vetted rich renderer exists;
- sanitize links and show target host;
- do not execute embedded HTML/scripts;
- avoid loading remote media by default in dense lists;
- preserve provenance and source labels;
- do not show credential-bearing URLs.

## Logging And Screenshots

Logs, telemetry, screenshots and test failures must not include:

- tokens;
- OAuth codes;
- raw post/comment text;
- author handles;
- private workspace names when pseudonymous ids are enough;
- query strings with sensitive params;
- raw prompt/summary instructions.

Use redacted fields and fake fixtures.

## Credential Repair UX

Credential repair flows must:

- show high-level state, not token details;
- use explicit action intent and confirmation when risk is credential-affecting;
- route through auth/provider handoff screens owned by app/auth composition;
- clear stale repair state on workspace switch;
- never expose OAuth callback secrets in UI logs.

## Feature Flag And Permission Safety

Capabilities fail closed.

Rules:

- hidden feature means inaccessible route and disabled commands;
- disabled UI shows stable reason and repair action when available;
- permission checks are repeated at backend;
- frontend flags are UX controls, not authorization.

## Review Checklist

Before shipping a frontend feature that touches provider data:

- no raw provider DTO in widgets/stores;
- no persistent cache without ADR;
- no direct console logging;
- no realistic secrets in tests;
- permission/credential repair state is explicit;
- screenshots and goldens use fake content;
- telemetry fields are redacted and classified.

