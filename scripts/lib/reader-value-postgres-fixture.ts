import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { defaultPostgresRuntimePoolConfig } from '@social-monitor/platform-persistence';
import { PrismaReaderValueConnection } from '../../libs/relevance/infrastructure/reader-value/prisma-reader-value-connection';
import type { AssessmentSqlClient, AssessmentSqlTransaction } from '../../libs/relevance/infrastructure/reader-value/assessment-sql';
import type { ReaderValuePreparedInput } from '../../libs/relevance/application/contracts/reader-value-assessment-store';
import { SourceContentSafetyPolicy } from '../../libs/relevance/domain/source-content-safety';
import { prepareReaderValueSourceSnapshot, sha256 } from '../../libs/relevance/infrastructure/reader-value/reader-value-source-snapshot';

export async function assessmentPostgresFixture() {
  const connectionString = process.env.READER_VALUE_TEST_ADMIN_DATABASE_URL;
  if (!connectionString) throw new Error('READER_VALUE_TEST_ADMIN_DATABASE_URL is required; only a local assessment_test_admin sandbox is allowed');
  const url = new URL(connectionString);
  if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.username !== 'assessment_test_admin') {
    throw new Error('Assessment integration gate refuses non-sandbox database identity');
  }
  const admin = new Pool({ connectionString, min: 0, max: 1 });
  const suffix = randomUUID().replaceAll('-','');
  const databaseName = `reader_value_test_${suffix}`;
  const runtimeRole = `reader_value_test_${suffix}`;
  const ownerRole = 'social_monitor_public_schema_owner';
  const capability = 'social_monitor_tenant_system_runtime';
  const createdRoles: string[] = [];
  let databaseCreated = false;
  let setup: Pool | undefined;
  let runtime: Pool | undefined;
  let runtimeConnection: PrismaReaderValueConnection | undefined;
  async function close() {
    await runtimeConnection?.onApplicationShutdown();
    await runtime?.end(); await setup?.end();
    if (databaseCreated) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    for (const role of createdRoles.reverse()) await admin.query(`DROP ROLE "${role}"`);
    await admin.end();
  }
  try {
    for (const role of [ownerRole,capability,'social_monitor_reader_summary_publication_owner',runtimeRole]) {
      if ((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount === 0) {
        await admin.query(`CREATE ROLE "${role}" ${role===runtimeRole ? 'LOGIN' : 'NOLOGIN'} NOSUPERUSER NOBYPASSRLS`);
        createdRoles.push(role);
      }
    }
    await admin.query(`GRANT "${capability}" TO "${runtimeRole}"`);
    await admin.query(`CREATE DATABASE "${databaseName}" OWNER "${ownerRole}"`);
    databaseCreated=true;
    url.pathname=`/${databaseName}`;
    setup = new Pool({connectionString:url.toString(),min:0,max:2});
    await setup.query(`SET ROLE "${ownerRole}"`);
    // Partial migration fixture: baseline + RLS helpers + CP1 migration only.
    // This intentionally does not certify the full historical migration chain.
    await setup.query(readFileSync('prisma/migrations/20260618143000_baseline/migration.sql','utf8'));
    const rls=readFileSync('prisma/migrations/20260723153000_tenant_row_level_security/migration.sql','utf8');
    await setup.query(rls.slice(0,rls.indexOf('DO $tenant_root_rls$'))+'\nCOMMIT;');
    await setup.query('RESET ROLE');
    for (const table of ['source_items', 'interests', 'reader_summary_jobs']) {
      await setup.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
        CREATE POLICY tenant_isolation ON ${table}
          USING (public.social_monitor_rls_workspace_match(tenant_id,workspace_id))
          WITH CHECK (public.social_monitor_rls_workspace_match(tenant_id,workspace_id))`);
    }
    await setup.query(readFileSync('prisma/migrations/20260920120000_reader_value_assessments/migration.sql','utf8'));
    await setup.query(`GRANT USAGE ON SCHEMA public TO "${runtimeRole}";
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${runtimeRole}";
      GRANT DELETE ON source_items,interests,feed_items TO "${runtimeRole}";
      GRANT UPDATE(status) ON reader_summary_jobs TO "${runtimeRole}"`);
    url.username=runtimeRole; url.password='';
    runtime=new Pool({connectionString:url.toString(),min:0,max:2});
    runtimeConnection = await PrismaReaderValueConnection.create(defaultPostgresRuntimePoolConfig(url.toString(), 'intelligence-worker'));
    const client = new PgAssessmentClient(runtimeConnection.client);
    return {setup, runtime, client, close};
  } catch (error) { await close(); throw error; }
}

/** Fault injection delegates to the actual production Prisma runtime transaction path. */
export class PgAssessmentClient implements AssessmentSqlClient {
  loseNextCommitAcknowledgement=false;
  constructor(private readonly client: AssessmentSqlClient) {}
  $queryRawUnsafe<T>(): Promise<T> { throw new Error('Assessment read must use a scoped transaction'); }
  $executeRawUnsafe(): Promise<number> { throw new Error('Assessment write must use a scoped transaction'); }
  async $transaction<T>(operation: (tx: AssessmentSqlTransaction) => Promise<T>,
    options: { isolationLevel: 'Serializable'; maxWait: number; timeout: number }): Promise<T> {
    const result = await this.client.$transaction(operation, options);
    if (this.loseNextCommitAcknowledgement) {
      this.loseNextCommitAcknowledgement=false;
      throw new Error('Fixture lost commit acknowledgement');
    }
    return result;
  }
}

export async function seedAssessmentSource(db: Pool, sourceAgeDays=0) {
  const tenantId=randomUUID(),workspaceId=randomUUID(),interestId=randomUUID(),sourceItemId=randomUUID();
  const bindingId=randomUUID(),feedId=randomUUID();
  await db.query('INSERT INTO tenants(id,slug,name,updated_at) VALUES($1::uuid,$1::text,\'test\',clock_timestamp())',[tenantId]);
  await db.query('INSERT INTO workspaces(id,tenant_id,slug,name,updated_at) VALUES($1::uuid,$2::uuid,$1::text,\'test\',clock_timestamp())',[workspaceId,tenantId]);
  await db.query('INSERT INTO interests(id,tenant_id,workspace_id,name,query,updated_at) VALUES($1,$2,$3,\'test\',\'Testing methods\',clock_timestamp())',
    [interestId,tenantId,workspaceId]);
  const catalog = await db.query<{ id: string }>(`INSERT INTO source_catalog_entries(id,provider_key,display_name,acquisition_mode,readiness,updated_at)
    VALUES($1,'rss','test','pull','enabled_beta',clock_timestamp())
    ON CONFLICT (provider_key) DO UPDATE SET provider_key=EXCLUDED.provider_key RETURNING id`,[randomUUID()]);
  const catalogId=catalog.rows[0]!.id;
  await db.query(`INSERT INTO source_bindings(id,tenant_id,workspace_id,interest_id,source_catalog_entry_id,capability_profile_version,status,config,updated_at)
    VALUES($1,$2,$3,$4,$5,1,'ENABLED','{}',clock_timestamp())`,[bindingId,tenantId,workspaceId,interestId,catalogId]);
  await db.query(`INSERT INTO source_items(id,tenant_id,workspace_id,source_binding_id,provider_key,provider_item_id,canonical_url,title,body,
    published_at,content_hash,observed_at,content_updated_at,metadata,created_at)
    VALUES($1::uuid,$2,$3,$4,$5,$1::text,'https://example.test/post','method','full source body',
    clock_timestamp(),'test',clock_timestamp(),clock_timestamp(),'{"kind":"rss_item"}',clock_timestamp()-$6::int*interval '1 day')`,
    [sourceItemId,tenantId,workspaceId,bindingId,'rss',sourceAgeDays]);
  await db.query(`INSERT INTO feed_items(id,tenant_id,workspace_id,interest_id,source_item_id,source_binding_id,provider_key,dedupe_key,
    canonical_url,title,body_preview,published_at,observed_at,updated_at,provider_metadata) VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$1::text,
    'https://example.test/post','method','preview',clock_timestamp(),clock_timestamp(),clock_timestamp(),'{"kind":"rss_item"}')`,
    [feedId,tenantId,workspaceId,interestId,sourceItemId,bindingId,'rss']);
  const prepared=prepareReaderValueSourceSnapshot({tenantId,workspaceId,interestId,sourceItemId,providerKey:'rss',
    canonicalUrl:'https://example.test/post',title:'method',body:'full source body',interest:'Testing methods',
    capture:{representationVersion:'fixture.v1',availability:'complete',segments:[]},availableAt:'2026-09-20T00:00:00Z'},new SourceContentSafetyPolicy());
  if (!prepared.ok) throw new Error('Invalid assessment fixture');
  const input: ReaderValuePreparedInput={tenantId,workspaceId,interestId,sourceItemId,sourceRevisionKey:'test',
    sourceSnapshotSha256:prepared.value.sourceSnapshotSha256,interestSha256:prepared.value.interestSha256,
    rubricVersion:'fixture.v1',rubricSha256:sha256('rubric'),inputBuilderVersion:'fixture.v1',modelConfigVersion:'fixture.v1',
    inputSha256:sha256('fixture-input'),requestSha256:sha256('{}'),requestedModel:'fixture-model',requestBody:'{}',snapshot:prepared.value};
  return {input,feedId,bindingId};
}

export async function seedAssessmentJob(db: Pool, input: ReaderValuePreparedInput): Promise<string> {
  const id=randomUUID();
  await db.query(`INSERT INTO reader_summary_jobs(id,tenant_id,workspace_id,scope_type,scope_key,interest_id,cadence,
    period_started_at,period_ended_at,period_timezone,period_key,idempotency_key,requested_at,updated_at)
    VALUES($1::uuid,$2,$3,'interest',$4::text,$4::uuid,'daily',clock_timestamp()-interval '1 day',clock_timestamp(),'UTC',$1::text,$1::text,clock_timestamp(),clock_timestamp())`,
    [id,input.tenantId,input.workspaceId,input.interestId]);
  return id;
}
