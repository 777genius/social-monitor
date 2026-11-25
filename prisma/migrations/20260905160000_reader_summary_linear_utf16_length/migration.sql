-- @social-monitor-forward-migration
-- No row rewrite or canonical byte/bounds change. Two linear Unicode scans
-- replace positional substring traversal. Lock risk: function catalog only.
BEGIN;
SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

-- CREATE OR REPLACE retains the existing owner and ACL. Preserve all function
-- attributes and search_path; PostgreSQL text cannot contain surrogate scalars.
-- Each supplementary scalar contributes one extra JavaScript UTF-16 code unit.
CREATE OR REPLACE FUNCTION public.reader_summary_weekly_utf16_length(value TEXT)
RETURNS INTEGER LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
RETURN char_length(value) + regexp_count(value COLLATE "C", U&'[\+010000-\+10FFFF]');

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
