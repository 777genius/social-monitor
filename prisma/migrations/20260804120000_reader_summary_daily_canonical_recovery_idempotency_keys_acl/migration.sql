-- @social-monitor-forward-migration
-- Durable, column-only claim access for the recovery SECURITY DEFINER owner.
-- Lock risk: ACL catalog updates only; no relation scan or row lock is taken.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";

REVOKE ALL PRIVILEGES ON TABLE public."idempotency_keys"
FROM "social_monitor_reader_summary_publication_owner";
GRANT SELECT ("id", "tenant_id", "workspace_id", "scope"), UPDATE ("id")
ON TABLE public."idempotency_keys"
TO "social_monitor_reader_summary_publication_owner";

DO $assert_reader_summary_recovery_idempotency_acl$
DECLARE
  v_relation CONSTANT REGCLASS := 'public.idempotency_keys'::REGCLASS;
  v_owner CONSTANT NAME := 'social_monitor_reader_summary_publication_owner';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = v_relation
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND (
        pg_catalog.has_column_privilege(
          v_owner, v_relation, attribute.attname, 'SELECT'
        ) IS DISTINCT FROM (
          attribute.attname = ANY (
            ARRAY['id', 'tenant_id', 'workspace_id', 'scope']::NAME[]
          )
        )
        OR pg_catalog.has_column_privilege(
          v_owner, v_relation, attribute.attname, 'UPDATE'
        ) IS DISTINCT FROM (attribute.attname = 'id'::NAME)
        OR pg_catalog.has_column_privilege(
          v_owner, v_relation, attribute.attname, 'INSERT'
        )
        OR pg_catalog.has_column_privilege(
          v_owner, v_relation, attribute.attname, 'REFERENCES'
        )
      )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(
      ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
        'REFERENCES', 'TRIGGER']::TEXT[]
    ) AS privilege(name)
    WHERE pg_catalog.has_table_privilege(v_owner, v_relation, privilege.name)
  ) THEN
    RAISE EXCEPTION 'reader summary recovery idempotency ACL is not exact';
  END IF;
END
$assert_reader_summary_recovery_idempotency_acl$;

RESET ROLE;
COMMIT;
