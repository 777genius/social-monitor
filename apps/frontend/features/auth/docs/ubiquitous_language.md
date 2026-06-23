# Auth Ubiquitous Language

## Purpose

Owns session, tenant, workspace access and authentication workflow language.

## Core Terms

- Session: authenticated user state for the current workspace.
- Tenant: customer boundary that owns workspaces and access policy.
- Workspace access: permission to operate inside a workspace.

## Forbidden Synonyms

- Do not use backend token DTO names as user-facing domain terms.

## Open Questions

- Which auth flows are anonymous, invite-only or workspace-scoped?
