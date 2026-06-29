# Interests Ubiquitous Language

## Purpose

Owns monitoring intent, interest naming, backend search specification and interest lifecycle language.

## Core Terms

- Interest: stable information need configured by a workspace.
- Interest name: human-readable label for the monitoring intent.
- Interest brief: human-readable description of what the user wants to follow.
- Interest search spec: backend search expression and normalized hints used to collect relevant activity.
- Interest coverage: source coverage planned or configured for an interest.
- Interest lifecycle: creation, update, archive and reactivation state.

## Forbidden Synonyms

- Do not call every search query an interest unless it is a configured monitoring intent.
- Do not call interest query fields keywords unless the backend exposes keyword-specific rules.
- Do not call GitHub repository topics interests. They are provider-native metadata.

## Open Questions

- Which advanced interest rule types should be introduced after the backend supports them?
