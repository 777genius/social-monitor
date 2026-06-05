# 244 - Permission Model RBAC/ABAC Policy

## Decision

Use tenant-scoped RBAC for baseline roles and ABAC/policy checks for resource ownership, source capabilities and sensitive actions.

Do not rely on roles alone for authorization.

## Sources

- OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP API Security Top 10: https://owasp.org/API-Security/
- NIST SP 800-63 Digital Identity Guidelines: https://www.nist.gov/identity-access-management/nist-special-publication-800-63-digital-identity-guidelines

## Core Roles

Initial tenant roles:

- owner
- admin
- analyst
- viewer
- billing_admin
- integration_manager
- support_proxy_internal only for controlled support access

Roles map to permissions. Code checks permissions, not role names directly.

## Permission Examples

```text
topic.create
topic.update
topic.delete
source.connect
source.disconnect
source.view_credentials_status
scan_policy.update
summary.generate
summary.view
digest.configure
webhook.manage
audit.view
billing.manage
member.invite
member.remove
```

## Attribute Checks

ABAC inputs:

- tenant id
- user id
- role/permissions
- resource owner tenant
- source type
- plan entitlement
- data classification
- support access scope
- legal hold/retention state
- action risk level

## Object-Level Authorization

Every object read/write must verify tenant ownership and permission.

Never trust client-supplied tenant id alone.

API routes with object ids must load or check ownership before returning data.

## Sensitive Actions

Require recent-auth or step-up for:

- deleting source credentials
- exporting tenant data
- rotating API keys
- changing IdP settings
- changing billing
- inviting/removing admins
- disabling retention/legal hold controls

## Policy Engine Boundary

Application layer uses:

```text
AuthorizationPort.can(actor, action, resource, context)
```

Implementation may be local rules first and external policy engine later.

Domain logic may enforce invariants, but access decisions belong to application/security layer.

## Deny By Default

Unknown action: deny.

Unknown resource type: deny.

Missing tenant context: deny.

Support access without approved scope: deny.

## Testing

Every new permission needs:

- positive test
- negative cross-tenant test
- role matrix test
- object ownership test
- API endpoint test

## Architecture Rule

RBAC decides what a user generally may do.

ABAC decides whether they may do it to this resource in this context.
