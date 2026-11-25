import type { PoolClient } from "pg";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { buildSourceEngagementMetrics, sourceItemContentHash, sourceItemProviderContentHash,
  type SourceItemProps } from "@social-monitor/ingestion/domain";
import { readerSummaryPolicyFromPrisma } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import { fixtureDate, fixtureId, fixtureMetadata, fixtureObservedThrough, fixturePriorPayload,
  fixturePriorTime, seedSuccessorInput } from "./reader-summary-successor-fixture-seed";
import { refreshScope } from "./reader-summary-new-input-refresh-manifest";

// Capture the actual INSERT parameters without constructing a DB connection.
// This deliberately supports only the fixture's simple INSERT syntax.
async function seedRows() {
  const rows: Record<string, Record<string, unknown>> = {};
  const query = jest.fn(async (sql: string, parameters: readonly unknown[]) => {
    const match = /insert into (\w+)\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/u.exec(sql);
    if (!match) throw new Error(`Unexpected fixture SQL: ${sql}`);
    const columns = match[2]!.split(",").map(value => value.trim());
    const values = match[3]!.split(",").map(value => value.trim());
    expect(values).toHaveLength(columns.length);
    rows[match[1]!] = Object.fromEntries(columns.map((column, index) => {
      const value = values[index]!;
      const placeholder = /^\$(\d+)(?:::jsonb)?$/u.exec(value);
      if (placeholder) {
        const parameter = parameters[Number(placeholder[1]) - 1];
        expect(parameter).not.toBeUndefined();
        return [column, value.endsWith("::jsonb") ? JSON.parse(String(parameter)) as unknown : parameter];
      }
      if (value.startsWith("'")) return [column, value.slice(1, -1)];
      if (value === "ARRAY['daily']") return [column, ["daily"]];
      if (value === "true" || value === "false") return [column, value === "true"];
      if (/^\d+$/u.test(value)) return [column, Number(value)];
      throw new Error(`Unsupported fixture SQL value: ${value}`);
    }));
    return { rows: [], rowCount: 1 };
  });
  await seedSuccessorInput({ query } as unknown as PoolClient);
  expect(Object.keys(rows)).toHaveLength(8);
  return rows;
}
const instant = (value: unknown) => new Date(value as string | Date).getTime();

describe("successor seed contracts without database access", () => {
  it("satisfies the PG30-minute bucket and snapshot time constraints with the actual domain cadence", async () => {
    const rows = await seedRows();
    const observation = rows.source_item_engagement_observations!;
    const snapshot = rows.source_item_engagement_snapshots!;
    const observed = instant(observation.observed_at), bucket = instant(observation.bucket_started_at);
    expect(new Date(bucket).toISOString()).toBe("2026-09-05T21:30:00.000Z");
    expect(bucket % (30 * 60_000)).toBe(0);
    expect(observed).toBeGreaterThanOrEqual(bucket);
    expect(observed).toBeLessThan(bucket + 30 * 60_000);
    expect(observation).toMatchObject({ reason: "INITIAL", metrics_changed: true, has_regression: false });
    for (const key of ["first_observed_at", "last_changed_at", "last_observed_at", "last_observation_at"]) {
      expect(instant(snapshot[key])).toBe(observed);
    }
    // Story age is 57h59m: the domain schedules another observation in 180m.
    expect(new Date(instant(snapshot.next_observation_due_at)).toISOString()).toBe("2026-09-06T00:59:00.000Z");
    const metrics = buildSourceEngagementMetrics({ providerKey: "hacker-news", metadata: fixtureMetadata });
    for (const row of [snapshot, observation]) {
      expect(row).toMatchObject({ ...metrics.metrics, metrics_hash: metrics.metricsFingerprint });
      expect(row.points).toBeGreaterThanOrEqual(0); expect(row.comments).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps every scoped row and provider FK aligned and exposes new input at the exact capture cutoff", async () => {
    const rows = await seedRows();
    for (const [table, row] of Object.entries(rows)) {
      if (table !== "source_catalog_entries") expect(row).toMatchObject({
        tenant_id: refreshScope.tenantId, workspace_id: refreshScope.workspaceId });
    }
    const source = rows.source_items!, feed = rows.feed_items!, binding = rows.source_bindings!;
    expect(binding.interest_id).toBe(rows.interests!.id);
    expect(binding.source_catalog_entry_id).toBe(rows.source_catalog_entries!.id);
    for (const row of [source, feed, rows.source_item_engagement_observations!]) {
      expect(row.source_binding_id).toBe(binding.id);
    }
    for (const row of [feed, rows.source_item_engagement_observations!, rows.source_item_engagement_snapshots!]) {
      expect(row.source_item_id).toBe(source.id); expect(row.provider_key).toBe(source.provider_key);
    }
    expect(feed).toMatchObject({ interest_id: binding.interest_id, status: "VISIBLE", provider_metadata: fixtureMetadata });
    expect(source.metadata).toEqual(fixtureMetadata);
    expect(source.observed_at).toBe(fixtureObservedThrough); expect(feed.observed_at).toBe(fixtureObservedThrough);
    expect(instant(feed.observed_at)).toBeGreaterThan(fixturePriorTime.getTime());
    expect(instant(feed.published_at)).toBeGreaterThanOrEqual(Date.parse(`${fixtureDate}T00:00:00.000Z`));
    expect(instant(feed.published_at)).toBeLessThan(fixturePriorTime.getTime());
    const props: SourceItemProps = { id: String(source.id), tenantId: tenantId(String(source.tenant_id)),
      workspaceId: workspaceId(String(source.workspace_id)), sourceBindingId: String(source.source_binding_id),
      externalId: String(source.provider_item_id), canonicalUrl: String(source.canonical_url), title: String(source.title),
      body: String(source.body), publishedAt: new Date(String(source.published_at)), ingestedAt: new Date(String(source.observed_at)),
      metadata: fixtureMetadata };
    expect(source.content_hash).toBe(sourceItemContentHash(props));
    expect(source.provider_content_hash).toBe(sourceItemProviderContentHash({ providerKey: "hacker-news", snapshot: props }));
  });

  it("rehydrates every seeded policy setting through the current persistence mapper", async () => {
    const row = (await seedRows()).reader_summary_policies!;
    const record = Object.fromEntries(Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/gu, (_match, letter: string) => letter.toUpperCase()), value,
    ]));
    const policy = readerSummaryPolicyFromPrisma({ ...record, interestId: null, customInstructions: null,
      createdAt: new Date(String(row.created_at)), updatedAt: new Date(String(row.updated_at)),
    } as Parameters<typeof readerSummaryPolicyFromPrisma>[0]);
    expect(policy.toGenerationPolicy()).toMatchObject({ format: "executive_brief", dedupeStrategy: "canonical_url_then_title" });
    expect(policy.toScheduleSettings()).toEqual({ enabled: false, timezone: "UTC", cadences: ["daily"] });
  });

  it("preserves the actual publisher's running candidate and requested-day prerequisites", () => {
    const { running, payload } = fixturePriorPayload();
    expect(running.toSnapshot()).toMatchObject({ id: fixtureId(1), status: "running" });
    expect(running.toSnapshot().requestedAt.toISOString().slice(0, 10)).toBe(fixtureDate);
    expect(payload.periodStartedAt).toBe(`${fixtureDate}T00:00:00.000Z`);
  });
});
