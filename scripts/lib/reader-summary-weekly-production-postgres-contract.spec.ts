import {
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryWeeklyScopeKey,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import { readerSummaryWeeklyCanonicalProviderKeys } from "../../libs/summary/domain/value-objects/reader-summary-weekly-daily-certification";
import { readerSummaryWeeklyPublicationEvidenceSchemaVersion } from "../../libs/summary/domain/value-objects/reader-summary-weekly-publication-evidence";
import { readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion } from "../../libs/summary/domain/value-objects/reader-summary-weekly-publication-github-evidence";
import {
  assertReaderSummaryWeeklyProductionPostgresContract,
  loadReaderSummaryWeeklyProductionDbState,
  resolveReaderSummaryWeeklyProductionWindow,
  type ReaderSummaryWeeklyProductionPostgresClient,
} from "./reader-summary-weekly-production-postgres-contract";

const tenantId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const scope = Object.freeze({
  tenantId,
  workspaceId,
  scope: Object.freeze({ type: "workspace" as const }),
});
const week = resolveReaderSummaryWeeklyProductionWindow("2026-07-20");

describe("reader summary weekly production postgres contract", () => {
  it("validates the DB-owned weekly table and publish function", async () => {
    const client = fakeClient([]);

    await expect(
      assertReaderSummaryWeeklyProductionPostgresContract(client),
    ).resolves.toBeUndefined();
  });

  it("classifies exact Monday-Sunday 7/7 completed certifications as complete", async () => {
    const state = await loadReaderSummaryWeeklyProductionDbState(
      fakeClient(week.dates.map(rowForDate)),
      scope,
      week,
    );

    expect(state.status).toBe("complete");
    expect(state.certifications).toHaveLength(7);
    expect(state.missingDates).toEqual([]);
    expect(state.blockingReasons).toEqual([]);
  });

  it("classifies missing DB certifications as partial with explicit reasons", async () => {
    const state = await loadReaderSummaryWeeklyProductionDbState(
      fakeClient(week.dates.slice(0, 6).map(rowForDate)),
      scope,
      week,
    );

    expect(state.status).toBe("partial");
    expect(state.missingDates).toEqual(["2026-07-26"]);
    expect(state.blockingReasons).toContain(
      "missing DB certification for 2026-07-26",
    );
  });

  it("classifies no weekly DB certifications as unavailable", async () => {
    const state = await loadReaderSummaryWeeklyProductionDbState(
      fakeClient([]),
      scope,
      week,
    );

    expect(state.status).toBe("unavailable");
    expect(state.certifications).toEqual([]);
  });
});

type FakeRow = ReturnType<typeof rowForDate>;

const fakeClient = (
  rows: readonly FakeRow[],
): ReaderSummaryWeeklyProductionPostgresClient => ({
  async query(sql) {
    if (sql.includes("to_regclass")) {
      return {
        rows: [
          {
            evidence_table: "reader_summary_weekly_publication_evidence",
            publish_function: "publish_reader_summary(jsonb)",
            column_count: "28",
          },
        ],
      };
    }
    return { rows };
  },
});

function rowForDate(date: string) {
  const canonicalRecord = {
    requestedUtcDate: date,
    providerCounts: readerSummaryWeeklyCanonicalProviderKeys.map(
      (providerKey) => ({
        providerKey,
        count:
          providerKey === "github-trending-page"
            ? 10
            : providerKey === "rss"
              ? 1
              : 0,
      }),
    ),
  };
  const canonicalSha256 =
    canonicalizeReaderSummaryWeeklyJson(canonicalRecord).sha256;
  return {
    requested_utc_date: date,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    scope_type: "workspace",
    scope_key: readerSummaryWeeklyScopeKey(scope.scope),
    cadence: "daily",
    period_started_at: `${date}T00:00:00.000Z`,
    period_ended_at: `${nextDate(date)}T00:00:00.000Z`,
    period_timezone: "UTC",
    publication_id: `publication:${date}`,
    reader_summary_job_id: `job:${date}`,
    reader_summary_artifact_id: `artifact:${date}`,
    report_id: `report:${date}`,
    proof_id: `proof:${date}`,
    semantic_status: "COMPLETED",
    report: { status: "ok" },
    exact_proof: { status: "ok" },
    provider_evidence: providerEvidence(date),
    github_evidence: {
      schemaVersion: readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion,
      mode: "verified",
      evidenceCount: 10,
      repositories: Array.from({ length: 10 }, (_, index) => ({
        rank: index + 1,
        canonicalUrl: `https://github.com/example/repo-${date}-${index}`,
      })),
      sha256: sha(`github:${date}`),
    },
    canonical_record: canonicalRecord,
    canonical_sha256: canonicalSha256,
    identity: `${readerSummaryWeeklyPublicationEvidenceSchemaVersion}:${canonicalSha256}`,
    recorded_at: `${date}T12:00:00.000Z`,
  };
}

function providerEvidence(date: string) {
  return [
    evidence(date, "github-trending-page", 0),
    evidence(date, "rss", 1),
  ];
}

function evidence(date: string, providerKey: string, index: number) {
  return {
    citationId: `citation:${date}:${providerKey}`,
    citationField: "title",
    feedItemId: `feed:${date}:${index}`,
    sourceItemId: `source-item:${date}:${index}`,
    sourceBindingId: `binding:${date}:${index}`,
    providerKey,
    providerItemId: `provider-item:${date}:${index}`,
    canonicalUrl: `https://example.com/${providerKey}/${date}/${index}`,
    title: `Durable weekly evidence ${providerKey} ${date}`,
    sourceText: `Evidence body for ${providerKey} on ${date} with enough stable source context.`,
    publishedAt: `${date}T08:00:00.000Z`,
    observedAt: `${date}T09:00:00.000Z`,
    sourceContentHash: sha(`${providerKey}:${date}:${index}`),
  };
}

function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function sha(input: string): string {
  return canonicalizeReaderSummaryWeeklyJson({ input }).sha256;
}
