import type * as PGliteModule from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { tenantId, workspaceId, type JsonObject } from "@social-monitor/shared-kernel";
import { SourceContentSafetyPolicy } from "@social-monitor/relevance/domain/source-content-safety";
import type { ReaderValuePreparedInput } from "@social-monitor/relevance/application/contracts/reader-value-assessment-store";
import type { ReaderValueInputBuilder } from "@social-monitor/relevance/application/contracts/reader-value-inventory";
import type { ReaderValueSource } from "@social-monitor/relevance/domain/reader-value/reader-value-source";
import { readerValueLabels } from "@social-monitor/relevance/domain/reader-value/reader-value-assessment";
import type { ReaderPostAssessmentIdentityBuilder } from "@social-monitor/summary/application/contracts/reader-post-assessment-identity";
import { PrismaReaderPostCatalog, type ReaderPostsSqlClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-post-catalog";

export async function catalogFixture(composition: {
  readonly builder: ReaderValueInputBuilder; readonly identity: ReaderPostAssessmentIdentityBuilder;
  readonly capture: (metadata: JsonObject, providerKey: string, title: string, body: string) => Pick<ReaderValueSource, "capture" | "availableAt">;
}) {
  const { PGlite } = process.getBuiltinModule("module").createRequire(__filename)("@electric-sql/pglite") as typeof PGliteModule;
  const db = new PGlite(), tenant = randomUUID(), workspace = randomUUID(), interest = randomUUID(), binding = randomUUID(), catalog = randomUUID();
  await db.exec(`CREATE TABLE tenants(id uuid,deleted_at timestamptz);
    CREATE TABLE workspaces(id uuid,tenant_id uuid,deleted_at timestamptz);
    CREATE TABLE interests(id uuid,tenant_id uuid,workspace_id uuid,query text,status text,deleted_at timestamptz);
    CREATE TABLE source_catalog_entries(id uuid,provider_key text);
    CREATE TABLE source_bindings(id uuid,tenant_id uuid,workspace_id uuid,interest_id uuid,source_catalog_entry_id uuid,status text,deleted_at timestamptz);
    CREATE TABLE source_items(id uuid,tenant_id uuid,workspace_id uuid,provider_key text,title text,body text,canonical_url text,content_hash text,metadata jsonb,created_at timestamptz DEFAULT clock_timestamp());
    CREATE TABLE feed_items(id uuid,tenant_id uuid,workspace_id uuid,source_item_id uuid,provider_key text,interest_id uuid,source_binding_id uuid,published_at timestamptz,provider_metadata jsonb,status text);
    CREATE TABLE source_item_engagement_snapshots(tenant_id uuid,workspace_id uuid,source_item_id uuid,provider_key text,last_observed_at timestamptz);
    CREATE TABLE reader_value_assessments(id uuid,tenant_id uuid,workspace_id uuid,interest_id uuid,source_item_id uuid,
      source_revision_key text,source_snapshot_sha256 text,interest_sha256 text,rubric_version text,rubric_sha256 text,
      input_builder_version text,model_config_version text,request_sha256 text,input_sha256 text,state text,expires_at timestamptz,result jsonb,assessed_at timestamptz DEFAULT clock_timestamp());`);
  await db.query("INSERT INTO tenants VALUES($1,NULL)", [tenant]);
  await db.query("INSERT INTO workspaces VALUES($1,$2,NULL)", [workspace, tenant]);
  await db.query("INSERT INTO interests VALUES($1,$2,$3,'Synthetic robot deployments','ENABLED',NULL)", [interest, tenant, workspace]);
  await db.query("INSERT INTO source_catalog_entries VALUES($1,'x-twitter')", [catalog]);
  await db.query("INSERT INTO source_bindings VALUES($1,$2,$3,$4,$5,'ENABLED',NULL)", [binding, tenant, workspace, interest, catalog]);
  const safety = new SourceContentSafetyPolicy(), builder = composition.builder;
  const statements: string[] = [];
  const client: ReaderPostsSqlClient = { $transaction: operation => db.transaction(async tx => operation({
    $queryRawUnsafe: async <T>(query: string, ...values: unknown[]) => {
      statements.push(query);
      return (await tx.query(query, values.map(value => value instanceof Date ? value.toISOString() : value))).rows as T;
    },
    $executeRawUnsafe: async (query, ...values) => { await tx.query(query, values); return 0; },
  })) };
  const reader = new PrismaReaderPostCatalog(client, safety, composition.identity);
  const window = { tenantId: tenantId(tenant), workspaceId: workspaceId(workspace), startedAt: new Date("2026-10-31T00:00:00Z"), endedAt: new Date("2026-11-01T00:00:00Z") };
  const insertPost = async (sourceMetadata: JsonObject = { kind: "x_post" }, quote = true) => {
    const id = randomUUID(), sourceItemId = randomUUID();
    const source = { ...window, interestId: interest, sourceItemId, providerKey: "x-twitter",
      canonicalUrl: `https://example.test/post/${id}`, title: "Measured robot deployment findings",
      body: "Ten practical findings from running a robot in production.", interest: "Synthetic robot deployments",
      ...(quote ? { quotedContext: "not_captured" as const } : {}),
      ...composition.capture(sourceMetadata, "x-twitter", "Measured robot deployment findings", "Ten practical findings from running a robot in production.") };
    await db.query("INSERT INTO source_items(id,tenant_id,workspace_id,provider_key,title,body,canonical_url,content_hash,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,'revision',$8)",
      [sourceItemId, tenant, workspace, source.providerKey, source.title, source.body, source.canonicalUrl, JSON.stringify(sourceMetadata)]);
    await db.query("INSERT INTO feed_items VALUES($1,$2,$3,$4,'x-twitter',$5,$6,'2026-10-31T10:00:00Z',$7,'VISIBLE')",
      [id, tenant, workspace, sourceItemId, interest, binding, JSON.stringify({ kind: "x_post", contentKind: quote ? "quote" : "original_post", likes: 100, retweets: 2 })]);
    const current = builder.prepare(source, "revision");
    if (!current.ok) throw new Error("Synthetic input refused");
    return { id, source, input: current.value };
  };
  const insertAssessment = async (input: ReaderValuePreparedInput, state = "assessed") => {
    const choices = { usefulness: "useful", relevance: "central", context_sufficiency: "sufficient", evidence_basis: "observation" };
    const result = Object.fromEntries(Object.entries(readerValueLabels).map(([name, labels]) => {
      const choice = choices[name as keyof typeof choices];
      return [name, { choice, probabilities: Object.fromEntries(labels.map(label => [label, label === choice ? 1 : 0])), confidence: 1 }];
    }));
    await db.query(`INSERT INTO reader_value_assessments VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,clock_timestamp()+interval '1 day',$16,DEFAULT)`,
      [randomUUID(), input.tenantId, input.workspaceId, input.interestId, input.sourceItemId, input.sourceRevisionKey, input.sourceSnapshotSha256,
        input.interestSha256, input.rubricVersion, input.rubricSha256, input.inputBuilderVersion, input.modelConfigVersion,
        input.requestSha256, input.inputSha256, state, JSON.stringify(result)]);
  };
  const insertPosts = async (count: number) => {
    const first = await insertPost();
    await db.query(`WITH copies AS (
      INSERT INTO source_items(id,tenant_id,workspace_id,provider_key,title,body,canonical_url,content_hash,metadata)
      SELECT gen_random_uuid(),s.tenant_id,s.workspace_id,s.provider_key,s.title,s.body,s.canonical_url,s.content_hash,s.metadata
      FROM source_items s JOIN feed_items f ON f.source_item_id=s.id
      CROSS JOIN generate_series(1,$2::integer) WHERE f.id=$1::uuid RETURNING id)
      INSERT INTO feed_items SELECT gen_random_uuid(),f.tenant_id,f.workspace_id,c.id,f.provider_key,
        f.interest_id,f.source_binding_id,f.published_at,f.provider_metadata,f.status
      FROM copies c CROSS JOIN feed_items f WHERE f.id=$1::uuid`, [first.id, count - 1]);
  };
  return { db, reader, builder, identity: composition.identity, statements, window, insertPost, insertPosts, insertAssessment };
}
