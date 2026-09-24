import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import { createReaderSummaryPublicationFixtureAuthority } from
  "./reader-summary-weekly-publication-evidence-postgres-contract";
import { buildApplicationV3FixturePayload } from
  "./reader-summary-v3-postgres-contract";
import { canonicalizeSqlRestTransport } from
  "./reader-summary-v3-postgres-flutter-fixture";
import { readerSummaryArtifactFromPrisma, type PrismaReaderSummaryArtifactRecord } from
  "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import { presentReaderSummaryArtifact } from
  "../../libs/summary/features/shared/reader-summary-artifact-presenter";
import { readerSummaryArtifactViewFromReaderSummaryView } from
  "../../libs/summary/interfaces/rest/reader-summary-rest.mapper";

describe("reader summary V3 PostgreSQL migration integration", () => {
  it("uses the full publication bootstrap and pins the PostgreSQL 18 creator edge", () => {
    const runner = readFileSync("scripts/check-reader-summary-v3-postgres.ts", "utf8");
    const publication = readFileSync(
      "scripts/check-reader-summary-publication-postgres.ts", "utf8");
    const privileges = readFileSync(
      "scripts/reader-summary-publication-postgres-privileges.ts", "utf8");
    const migration = readFileSync(
      "prisma/migrations/20260921120000_reader_summary_jev_v3_preparation/migration.sql",
      "utf8",
    );

    expect(runner).toContain(
      'runReaderSummaryPublicationPostgresContract("promotion-v3")',
    );
    expect(publication).toContain('runReaderSummaryPublicationBootstrapSql(\n      "pre"');
    expect(publication).toContain('runReaderSummaryPublicationBootstrapSql(\n      "post"');
    const setting = privileges.indexOf(
      'await provisioner.query("SET createrole_self_grant = \'\'")',
    );
    const runtimeCreation = privileges.indexOf(
      "CREATE ROLE ${quoteIdentifier(params.runtimeRole)}",
    );
    expect(setting).toBeGreaterThanOrEqual(0);
    expect(runtimeCreation).toBeGreaterThan(setting);
    expect(migration).toContain('SET LOCAL ROLE "social_monitor_public_schema_owner"');
    expect(migration).not.toMatch(/CREATE ROLE|GRANT .*SUPERUSER/u);
  });

  it("binds interest-scoped V3 citation authority to the publication interest", async () => {
    const publicationInterestId = randomUUID();
    const catalogId = randomUUID();
    const calls: Array<{ readonly sql: string; readonly values?: unknown[] }> = [];
    const client = {
      query: jest.fn(async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        return sql.includes("SELECT id::text FROM source_catalog_entries")
          ? { rows: [{ id: catalogId }] }
          : { rows: [] };
      }),
    } as unknown as PoolClient;

    const authority = await createReaderSummaryPublicationFixtureAuthority({
      client,
      tenantId: randomUUID(),
      workspaceId: randomUUID(),
      status: "COMPLETED",
      startedAt: "2026-06-14T00:00:00.000Z",
      endedAt: "2026-06-15T00:00:00.000Z",
      requestedAt: "2026-06-14T10:00:00.123456Z",
      overrides: { publicationInterestId, providerEvidence: "rss" },
    });

    const binding = calls.find(({ sql }) =>
      sql.includes("INSERT INTO source_bindings"));
    const source = calls.find(({ sql }) => sql.includes("INSERT INTO source_items"));
    const feed = calls.find(({ sql }) => sql.includes("INSERT INTO feed_items"));
    expect(binding?.values?.[3]).toBe(publicationInterestId);
    expect(binding?.values?.[4]).toBe(catalogId);
    expect(source?.values?.[3]).toBe(binding?.values?.[0]);
    expect(feed?.values?.[3]).toBe(publicationInterestId);
    expect(feed?.values?.[5]).toBe(binding?.values?.[0]);
    expect(authority.citations).toHaveLength(1);
  });

  it("builds a nonempty V3 artifact when the running fixture has no topReads", async () => {
    const tenantId = randomUUID();
    const workspaceId = randomUUID();
    const interestId = randomUUID();
    const artifactId = randomUUID();
    const feedItemId = randomUUID();
    const sourceItemId = randomUUID();
    const citationId = randomUUID();
    const sourceBindingId = randomUUID();
    const client = { query: jest.fn(async () => ({ rows: [{
      source_binding_id: sourceBindingId, interest_id: interestId,
      provider_key: "rss", title: "Publication evidence",
      body: "Exact provider evidence body.",
      published_at: "2026-06-14T09:00:00.123456Z",
      observed_at: "2026-06-14T09:01:00.123456Z",
      canonical_url: `https://example.test/publication/${sourceItemId}`,
      trusted_intent: "publication evidence",
    }] })) } as unknown as PoolClient;
    const source = { tenantId, workspaceId, interestId,
      readerSummaryArtifactId: artifactId,
      periodStartedAt: "2026-06-14T00:00:00.000Z",
      periodEndedAt: "2026-06-15T00:00:00.000Z", periodTimezone: "UTC",
      periodKey: "daily:2026-06-14T00:00:00.000Z:2026-06-15T00:00:00.000Z:UTC",
      requestedAt: "2026-06-14T10:00:00.123456Z",
      modelVersion: "codex:gpt-5.5:xhigh",
      report: { promptVersion: "reader-summary.prompt.pg-gate.v1",
        artifactPayload: { citationMap: [{ citationId, feedItemId, sourceItemId,
          providerKey: "rss", field: "title" }], content: { selectedPosts: [] } } },
      exactProof: {} };

    expect(source.report.artifactPayload.content).not.toHaveProperty("topReads");
    const result = await buildApplicationV3FixturePayload(client, source);
    const snapshot = result.applicationArtifact.toSnapshot();
    const topReads = result.payload.report.artifactPayload.content?.topReads;
    expect(snapshot.content?.topReads).toHaveLength(1);
    expect(snapshot.promotionAttestations).toHaveLength(1);
    expect(topReads).toHaveLength(1);
    const topRead = topReads?.[0];
    if (typeof topRead?.exactPublishedAt !== "string") {
      throw new Error("application-shaped V3 top read lacks exactPublishedAt");
    }
    expect(topRead.exactPublishedAt).toBe("2026-06-14T09:00:00.123456Z");

    const at = new Date(source.requestedAt);
    const record: PrismaReaderSummaryArtifactRecord = {
      id: artifactId, tenantId, workspaceId, scopeType: "interest",
      scopeKey: `interest:${interestId}`, interestId, cadence: "DAILY",
      periodStartedAt: new Date(source.periodStartedAt),
      periodEndedAt: new Date(source.periodEndedAt), periodTimezone: "UTC",
      periodKey: source.periodKey, userId: null, subscriptionId: null,
      status: "COMPLETED", schemaVersion: 1, modelVersion: source.modelVersion,
      promptVersion: source.report.promptVersion,
      headline: snapshot.headline, summaryText: snapshot.executiveSummary,
      artifactPayload: result.payload.report.artifactPayload,
      citations: snapshot.citationMap, qualitySignals: {}, createdAt: at,
      updatedAt: at,
    };
    const persisted = readerSummaryArtifactFromPrisma(record);
    const rest = readerSummaryArtifactViewFromReaderSummaryView(
      presentReaderSummaryArtifact(persisted, { status: "fresh", checkedAt: at }),
    );
    const expectedTransport = JSON.parse(readFileSync(
      "apps/frontend/features/summaries/test/fixtures/" +
        "reader_post_promotion_v3_sql_readback.json", "utf8")) as unknown;
    expect(canonicalizeSqlRestTransport(rest)).toEqual(expectedTransport);
  });
});
