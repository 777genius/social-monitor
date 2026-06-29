# Auth Ubiquitous Language

## Purpose

Owns session, tenant, workspace access and authentication workflow language.

## Core Terms

- Session: authenticated user state for the current workspace.
- User role: app-level role exposed as `admin` or `user` after backend session restore.
- Tenant: customer boundary that owns workspaces and access policy.
- Workspace access: permission to operate inside a workspace.
- Workspace role: workspace-scoped permission such as owner, admin, member or viewer. Do not confuse it with user role.

## Forbidden Synonyms

- Do not use backend token DTO names as user-facing domain terms.

## Open Questions

- Which auth flows are anonymous, invite-only or workspace-scoped?
