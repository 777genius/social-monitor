-- @social-monitor-forward-migration
-- Repair the daily SECURITY DEFINER role's global function defaults.
-- A schema-scoped default cannot revoke PostgreSQL's global PUBLIC EXECUTE.
BEGIN;
SET LOCAL search_path = pg_catalog;

DO $grant_daily_definer_default_acl_set$
BEGIN
  EXECUTE pg_catalog.format(
    'GRANT social_monitor_reader_summary_daily_publication_definer TO %I '
      'WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER',
    session_user
  );
END
$grant_daily_definer_default_acl_set$;

SET LOCAL ROLE social_monitor_reader_summary_daily_publication_definer;
ALTER DEFAULT PRIVILEGES
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
RESET ROLE;

DO $revoke_daily_definer_default_acl_set$
BEGIN
  EXECUTE pg_catalog.format(
    'REVOKE social_monitor_reader_summary_daily_publication_definer FROM %I '
      'GRANTED BY CURRENT_USER',
    session_user
  );
END
$revoke_daily_definer_default_acl_set$;

DO $verify_daily_definer_global_default_acl$
DECLARE
  v_definer_oid OID :=
    'social_monitor_reader_summary_daily_publication_definer'::REGROLE::OID;
BEGIN
  IF (
    SELECT count(*) <> 1 OR count(*) FILTER (
      WHERE member.rolname = session_user
        AND grantor.rolsuper
        AND membership.admin_option
        AND NOT membership.inherit_option
        AND NOT membership.set_option
    ) <> 1
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
    JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = membership.grantor
    WHERE membership.roleid = v_definer_oid
  ) THEN
    RAISE EXCEPTION 'daily definer default ACL bootstrap membership is unsafe';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_default_acl AS defaults
    WHERE defaults.defaclrole = v_definer_oid
      AND defaults.defaclnamespace = 0
      AND defaults.defaclobjtype = 'f'
  ) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl AS defaults
    CROSS JOIN LATERAL pg_catalog.aclexplode(defaults.defaclacl) AS acl
    WHERE defaults.defaclrole = v_definer_oid
      AND defaults.defaclnamespace = 0
      AND defaults.defaclobjtype = 'f'
      AND acl.grantee = v_definer_oid
      AND acl.privilege_type = 'EXECUTE'
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl AS defaults
    CROSS JOIN LATERAL pg_catalog.aclexplode(defaults.defaclacl) AS acl
    WHERE defaults.defaclrole = v_definer_oid
      AND defaults.defaclnamespace = 0
      AND defaults.defaclobjtype = 'f'
      AND (acl.grantee <> v_definer_oid OR acl.privilege_type <> 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'daily definer global function default ACL is unsafe';
  END IF;
END
$verify_daily_definer_global_default_acl$;

COMMIT;
