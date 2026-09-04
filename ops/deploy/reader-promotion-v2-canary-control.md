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
   It is a single transaction, supporting a managed PostgreSQL administrator
   with CREATEROLE and CREATE on this database, without requiring superuser.
   It refuses unsafe existing attributes, active/foreign memberships and
   cluster-wide ownership/ACL/policy collisions before creating the schema.
   Existing grants are not silently normalized. Only this transaction's
   temporary SET/INHERIT self-grant is removed before commit.
3. Provision credentials for `social_monitor_reader_promotion_canary_invoker`.
   Store its database URL in the root-owned, non-symlink secret file expected
   by the host runner. Never reuse the application or migration database URL.
4. Provision a dedicated restricted SSH identity whose forced command is the
   exact reviewed canary host script. It must not allow an arbitrary shell or
   use the normal unrestricted deploy identity. Configure only the dedicated
   `READER_PROMOTION_V2_CANARY_*` GitHub secrets and variables used by the workflow.
5. Verify the invoker has only the six public canary procedure grants, no table
   grants, no outbound or foreign memberships, and no product/publication rights.
   PostgreSQL 16+ retains an inbound creator ADMIN bookkeeping grant to the
   provisioning administrator. Its SET and INHERIT options must both be false;
   the administrator cannot assume the owner or read its schema through it.
   This retained role-management authority supports credential rotation and
   is not granted to the runtime invoker. Superuser provisioning needs no edge.
   Record release SHA, SQL/host-script digests and redacted ACL evidence.
6. Run the offline built-image inspection before dispatch:
   `bash ops/deploy/reader-promotion-v2-canary-image-inspection.test.sh IMAGE_ID`.
   It checks the actual executable, pinned launcher bytes and runtime package
   in the immutable daily-runner image, without credentials, networking or AI.

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
