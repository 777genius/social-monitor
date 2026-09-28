import type { PoolClient } from "pg";
import { assertPostgres as assert } from "./reader-summary-publication-postgres-assertions";

/** The API's ordinary Prisma connection inherits publication, not system DML. */
export const assertReaderValueAssessmentPublicationAcl = async (client: PoolClient): Promise<void> => {
  const acl = (await client.query<{
    readonly publicationRead: boolean; readonly publicationInsert: boolean;
    readonly publicationUpdate: boolean; readonly publicationDelete: boolean;
    readonly systemDelete: boolean; readonly publicRead: boolean;
  }>(`SELECT
    has_table_privilege('social_monitor_reader_summary_publication_runtime',
      'reader_value_assessments', 'SELECT') AS "publicationRead",
    has_table_privilege('social_monitor_reader_summary_publication_runtime',
      'reader_value_assessments', 'INSERT') AS "publicationInsert",
    has_table_privilege('social_monitor_reader_summary_publication_runtime',
      'reader_value_assessments', 'UPDATE') AS "publicationUpdate",
    has_table_privilege('social_monitor_reader_summary_publication_runtime',
      'reader_value_assessments', 'DELETE') AS "publicationDelete",
    has_table_privilege('social_monitor_tenant_system_runtime',
      'reader_value_assessments', 'DELETE') AS "systemDelete",
    EXISTS (SELECT 1 FROM aclexplode((SELECT relacl FROM pg_class
      WHERE oid='reader_value_assessments'::regclass))
      WHERE grantee=0 AND privilege_type='SELECT') AS "publicRead"`)).rows[0];
  assert(acl?.publicationRead === true && acl.publicationInsert === true &&
    acl.publicationUpdate === true && acl.publicationDelete === false &&
    acl.systemDelete === true && acl.publicRead === false,
  "V3 API publication role must prepare assessments without DELETE or public access");
};
