-- @social-monitor-forward-migration
-- API-side V3 preparation and promotion share the normal summary Prisma
-- connection. Give that existing publication capability only the assessment
-- operations it uses; the independent system worker retains DELETE authority.
BEGIN;
SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT SELECT, INSERT, UPDATE ON "reader_value_assessments"
  TO "social_monitor_reader_summary_publication_runtime";
COMMIT;
