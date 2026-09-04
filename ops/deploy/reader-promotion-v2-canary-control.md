# Isolated Reader Promotion V2 canary

This is a manually provisioned operational canary, not an application migration.
The normal application migrator must not receive superuser, database ownership
or additional role-management privileges to activate it. App deployment does
not create this canary's schema or roles.

## Provisioning contract

After independent review of the exact release SHA and before the first dispatch:

1. Verify the production machine identity, exact official deployed SHA and
   absence of an existing canary run. Keep the application deploy lock while
   provisioning the matching release assets.
2. Use the independently authorized database administrator to apply only
   `ops/deploy/reader-promotion-v2-canary-control-bootstrap.sql` from that SHA.
   It is a single transaction. It refuses unsafe pre-existing role attributes
   or role memberships, and does not silently normalize privileged roles.
3. Provision credentials for `social_monitor_reader_promotion_canary_invoker`.
   Store its database URL in the root-owned, non-symlink secret file expected
   by the host runner. Never reuse the application or migration database URL.
4. Provision a dedicated restricted SSH identity whose forced command is the
   exact reviewed canary host script. It must not allow an arbitrary shell or
   use the normal unrestricted deploy identity. Configure only the dedicated
   `READER_PROMOTION_V2_CANARY_*` GitHub secrets and variables used by the workflow.
5. Verify the invoker has only the six public canary procedure grants, no table
   grants, no memberships, and no authority over product/publication tables.
   Record release SHA, SQL/host-script digests and redacted ACL evidence.

Do not put credentials in this document, command output or source control.
Provisioning is not part of the live model run and spends no provider tokens.

## Refusal and replay

A bootstrap replay against an existing schema fails closed with no committed
changes; it never truncates, replaces or resets an existing singleton. After
an interrupted or uncertain provisioning connection, inspect the schema and
ACLs before deciding what remains. Do not treat a name collision as success.

The manual GitHub workflow runs against the exact protected-main/deployed SHA.
It may make one provider call. A result lost after the provider-entry barrier
becomes `UNCERTAIN`; it is never automatically retried. Re-dispatch reads the
same durable singleton, not a fresh run.

The canary proves live synthetic relation decisions and isolated product-policy
assertions. It does not publish a summary or prove the public summary UI flow;
that acceptance and real summary-artifact telemetry remain separate evidence.
