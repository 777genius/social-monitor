# Sources Ubiquitous Language

## Purpose

Owns source catalog, source profiles, source binding, credential health and
sync state language.

## Core Terms

- Source: external provider or feed that can produce monitored items.
- Source profile: backend-real provider capability and readiness record. It is
  read-only and does not represent a connected source.
- Source binding: workspace-specific connection between a source and monitoring intent.
- Credential health: current usability of source access material.
- Sync state: last known ingestion status for a source binding.
- Readiness state: product/backend certification state for using a provider.
- Runtime readiness: whether the current runtime can collect from the provider.
- Production safe: provider profile can be shown as supported for production UX.

## Forbidden Synonyms

- Do not call provider accounts sources unless they are configured as source bindings.
- Do not call source profiles connections, credentials or account links.

## Open Questions

- Which provider limits must be visible before binding a source?
