# 120. Policy Engine and Authorization

## Status

Locked for implementation blueprint.

## Research Anchors

- Open Policy Agent policy language: https://www.openpolicyagent.org/docs/policy-language
- PostgreSQL row security policies: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- OWASP API Security Top 10: https://owasp.org/API-Security/editions/2023/en/0x00-header/

## Decision

Start with explicit application authorization policies in code. Introduce OPA/Rego only when policy complexity or externalized policy management justifies it.

## Authorization Layers

| Layer | Purpose |
|---|---|
| API gateway guards | authentication, tenant selection, coarse route access |
| application use case policies | object-level authorization and business rules |
| entitlement checks | plan limits and feature availability |
| database constraints/RLS | defense-in-depth for high-risk data paths |
| audit logging | evidence of sensitive decisions |

## Policy Inputs

Authorization decisions use:

- actor id;
- tenant id;
- membership role;
- resource owner/scope;
- action;
- entitlement state;
- support/admin approval state;
- source binding state;
- request context risk.

## OPA Boundary

OPA is a policy decision point, not the domain model. If introduced:

- domain builds structured input;
- OPA returns allow/deny/reason;
- application layer still owns side effects;
- policies are versioned and tested;
- decisions are logged for sensitive actions.

## Best-Fact Choice

Broken object-level authorization is one of the highest API risks. Keep authorization close to use cases first; externalize only when complexity demands it.

