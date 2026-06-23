# Topics Ubiquitous Language

## Purpose

Owns monitoring intent, topic name, backend query and topic lifecycle language.

## Core Terms

- Topic: monitored intent configured by a workspace.
- Topic name: human-readable label for the monitoring intent.
- Topic query: backend search expression used to collect relevant activity.
- Topic lifecycle: creation, update, archive and reactivation state.

## Forbidden Synonyms

- Do not call every search query a topic unless it is a configured monitoring intent.
- Do not call topic query fields keywords unless the backend exposes keyword-specific rules.

## Open Questions

- Which advanced topic rule types should be introduced after the backend supports them?
