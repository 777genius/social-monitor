# Sources Ubiquitous Language

## Purpose

Owns source catalog, source binding, credential health and sync state language.

## Core Terms

- Source: external provider or feed that can produce monitored items.
- Source binding: workspace-specific connection between a source and monitoring intent.
- Credential health: current usability of source access material.
- Sync state: last known ingestion status for a source binding.

## Forbidden Synonyms

- Do not call provider accounts sources unless they are configured as source bindings.

## Open Questions

- Which provider limits must be visible before binding a source?
