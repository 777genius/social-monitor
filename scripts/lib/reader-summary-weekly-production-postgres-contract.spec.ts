import {
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryWeeklyScopeKey,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import { readerSummaryWeeklyCanonicalProviderKeys } from "../../libs/summary/domain/value-objects/reader-summary-weekly-daily-certification";
import { readerSummaryWeeklyPublicationEvidenceSchemaVersion } from "../../libs/summary/domain/value-objects/reader-summary-weekly-publication-evidence";
import { readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion } from "../../libs/summary/domain/value-objects/reader-summary-weekly-publication-github-evidence";
import {
  assertReaderSummaryWeeklyProductionPostgresContract,
  assertReaderSummaryWeeklyProductionWindow,
  loadReaderSummaryWeeklyProductionDbState,
  readerSummaryWeeklyReviewAuthorityFromProductionState,
  resolveCompletedReaderSummaryWeeklyProductionWindow,
  resolveReaderSummaryWeeklyProductionWindow,
  withReaderSummaryWeeklyProductionDatabaseAccess,
  type ReaderSummaryWeeklyProductionPostgresConnection,
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

  it("fails closed when the daily certification backfill capability is absent", async () => {
    await expect(
      assertReaderSummaryWeeklyProductionPostgresContract(
        fakeClient([], { backfillFunction: null }),
      ),
    ).rejects.toThrow("missing DB weekly capability");
  });

  it("fails closed when the backfill definer boundary is insecure", async () => {
    await expect(
      assertReaderSummaryWeeklyProductionPostgresContract(
        fakeClient([], { secureBackfill: false }),
      ),
    ).rejects.toThrow("missing DB weekly capability");
  });

  it("fails closed when the production slot boundary is insecure", async () => {
    await expect(
      assertReaderSummaryWeeklyProductionPostgresContract(
        fakeClient([], { secureSlotPrepare: false }),
      ),
    ).rejects.toThrow("missing DB weekly capability");
  });

  it("classifies exact Monday-Sunday 7/7 completed certifications as complete", async () => {
    const state = await loadReaderSummaryWeeklyProductionDbState(
      fakeClient(week.dates.map((date) => rowForDate(date))),
      scope,
      week,
    );

    expect(state.status).toBe("complete");
    expect(state.certifications).toHaveLength(7);
    expect(state.weeklyCertificationSeal).toMatchObject({
      tenantId,
      workspaceId,
      weekStartedOn: "2026-07-20",
      weekEndedOn: "2026-07-26",
    });
    expect(state.missingDates).toEqual([]);
    expect(state.blockingReasons).toEqual([]);
  });

  it("classifies an arbitrary future completed week as complete", async () => {
    const futureWeek = resolveCompletedReaderSummaryWeeklyProductionWindow(
      "2027-02-01",
      new Date("2027-02-08T06:00:00.000Z"),
    );
    const state = await loadReaderSummaryWeeklyProductionDbState(
      fakeClient(futureWeek.dates.map((date) => rowForDate(date))),
      scope,
      futureWeek,
    );

    expect(state.status).toBe("complete");
    expect(state.certifications.map((row) => row.requestedUtcDate)).toEqual(
      futureWeek.dates,
    );
  });

  it("rejects partial, non-contiguous, or mislabeled window objects", async () => {
    const partialWindow = {
      ...week,
      dates: week.dates.slice(0, 6),
    };
    expect(() =>
      assertReaderSummaryWeeklyProductionWindow(partialWindow),
    ).toThrow("must be exact Monday-Sunday UTC");
    await expect(
      loadReaderSummaryWeeklyProductionDbState(
        fakeClient([]),
        scope,
        partialWindow,
      ),
    ).rejects.toThrow("must be exact Monday-Sunday UTC");

    expect(() =>
      assertReaderSummaryWeeklyProductionWindow({
        ...week,
        dates: [...week.dates.slice(0, 6), "2026-07-27"],
      }),
    ).toThrow("must be exact Monday-Sunday UTC");
    expect(() =>
      assertReaderSummaryWeeklyProductionWindow({
        ...week,
        weekEndedOn: "2026-07-25",
      }),
    ).toThrow("must be exact Monday-Sunday UTC");
  });

  it("accepts genuine ordinary NO_SIGNAL zero-evidence certification", async () => {
    const rows = week.dates.map((date) =>
      rowForDate(
        date,
        date === "2026-07-25"
          ? { semanticStatus: "NO_SIGNAL", githubMode: "ordinary_not_required" }
          : undefined,
      ),
    );
    const state = await loadReaderSummaryWeeklyProductionDbState(
      fakeClient(rows),
      scope,
      week,
    );

    expect(state.status).toBe("complete");
    expect(state.blockingReasons).toEqual([]);
  });

  it("accepts only the sealed Jul 23 historical GitHub exception", async () => {
    const rows = week.dates.map((date) =>
      rowForDate(
        date,
        date === "2026-07-23"
          ? { githubMode: "historical_unavailable" }
          : undefined,
      ),
    );
    const state = await loadReaderSummaryWeeklyProductionDbState(
      fakeClient(rows),
      scope,
      week,
    );

    expect(state.status).toBe("complete");
    expect(state.blockingReasons).toEqual([]);
  });

  it("maps the exact seal and daily authorities without inventing Jul 23 GitHub evidence", async () => {
    const state = await loadReaderSummaryWeeklyProductionDbState(
      fakeClient(week.dates.map((date) => rowForDate(
        date,
        date === "2026-07-23"
          ? { githubMode: "historical_unavailable" }
          : undefined,
      ))),
      scope,
      week,
    );
    const authority = readerSummaryWeeklyReviewAuthorityFromProductionState(state);
    const july23 = authority.days[3];

    expect(authority.sealId).toBe(state.weeklyCertificationSeal?.sealId);
    expect(july23).toMatchObject({
      requestedUtcDate: "2026-07-23",
      githubMode: "historical_unavailable",
    });
    expect(july23?.providerEvidence.map((item) => item.providerKey)).not.toContain(
      "github-trending-page",
    );
  });

  it("fails closed on historical GitHub evidence for every other date", async () => {
    const rows = week.dates.map((date) =>
      rowForDate(
        date,
        date === "2026-07-22"
          ? { githubMode: "historical_unavailable" }
          : undefined,
      ),
    );
    const state = await loadReaderSummaryWeeklyProductionDbState(
      fakeClient(rows),
      scope,
      week,
    );

    expect(state.status).toBe("partial");
    expect(state.blockingReasons).toContain(
      "2026-07-22 lacks verified GitHub DB evidence",
    );
  });

  it("rejects a forged nested GitHub seal even when the outer seal is valid", async () => {
    const forged = rowForDate("2026-07-23", {
      githubMode: "historical_unavailable",
    });
    const githubEvidence = {
      ...forged.github_evidence,
      sha256: "b".repeat(64),
    };
    const canonicalRecord = {
      ...forged.canonical_record,
      githubEvidence,
    };
    const canonicalSha256 =
      canonicalizeReaderSummaryWeeklyJson(canonicalRecord).sha256;

    await expect(
      loadReaderSummaryWeeklyProductionDbState(
        fakeClient([
          {
            ...forged,
            github_evidence: githubEvidence,
            canonical_record: canonicalRecord,
            canonical_sha256: canonicalSha256,
            identity: `${readerSummaryWeeklyPublicationEvidenceSchemaVersion}:${canonicalSha256}`,
          },
        ]),
        scope,
        week,
      ),
    ).rejects.toThrow("GitHub evidence seal is invalid");
  });

  it.each([
    {
      name: "extra key",
      mutate: (item: Record<string, unknown>) => ({
        ...item,
        forged: true,
      }),
    },
    {
      name: "missing key",
      mutate: (item: Record<string, unknown>) => {
        const { sourceText: removed, ...rest } = item;
        void removed;
        return rest;
      },
    },
  ])("rejects providerEvidence with $name", async ({ mutate }) => {
    const forged = rowWithForgedProviderEvidence(
      rowForDate("2026-07-20"),
      mutate,
    );

    await expect(
      loadReaderSummaryWeeklyProductionDbState(
        fakeClient([forged]),
        scope,
        week,
      ),
    ).rejects.toThrow();
  });

  it("rejects oversized providerEvidence source text", () => {
    expect(() =>
      rowWithForgedProviderEvidence(
        rowForDate("2026-07-20"),
        (item) => ({
          ...item,
          sourceText: "x".repeat(16_385),
        }),
      ),
    ).toThrow("string length limit");
  });

  it("rejects resealed provider key/count and ordering drift", async () => {
    const original = rowForDate("2026-07-20");
    const reorderedEvidence = [
      original.provider_evidence.at(-1)!,
      ...original.provider_evidence.slice(0, -1),
    ];
    const reordered = resealRow(original, {
      providerEvidence: reorderedEvidence,
      githubEvidence: original.github_evidence,
    });
    await expect(
      loadReaderSummaryWeeklyProductionDbState(
        fakeClient([reordered]),
        scope,
        week,
      ),
    ).rejects.toThrow("provider evidence order diverged");

    const driftedCounts = {
      ...original.canonical_record,
      providerCounts: original.canonical_record.providerCounts.map(
        (entry, index) =>
          index === 0 ? { ...entry, count: entry.count - 1 } : entry,
      ),
    };
    const driftedSha =
      canonicalizeReaderSummaryWeeklyJson(driftedCounts).sha256;
    await expect(
      loadReaderSummaryWeeklyProductionDbState(
        fakeClient([
          {
            ...original,
            canonical_record: driftedCounts,
            canonical_sha256: driftedSha,
            identity: `${readerSummaryWeeklyPublicationEvidenceSchemaVersion}:${driftedSha}`,
          },
        ]),
        scope,
        week,
      ),
    ).rejects.toThrow("provider counts are not canonical");
  });

  it.each([
    {
      name: "blank reason",
      github: { historicalUnavailableReason: "" },
    },
    {
      name: "authorization before the daily period ended",
      github: { authorizedAt: "2026-07-23T23:59:59.999Z" },
    },
  ])("rejects Jul 23 historical evidence with $name", async ({ github }) => {
    const forged = rowWithForgedGitHubEvidence(
      rowForDate("2026-07-23", {
        githubMode: "historical_unavailable",
      }),
      github,
    );

    await expect(
      loadReaderSummaryWeeklyProductionDbState(
        fakeClient([forged]),
        scope,
        week,
      ),
    ).rejects.toThrow();
  });

  it("classifies missing DB certifications as partial with explicit reasons", async () => {
    const state = await loadReaderSummaryWeeklyProductionDbState(
      fakeClient(week.dates.slice(0, 6).map((date) => rowForDate(date))),
      scope,
      week,
    );

    expect(state.status).toBe("partial");
    expect(state.missingDates).toEqual(["2026-07-26"]);
    expect(state.blockingReasons).toContain(
      "missing DB certification for 2026-07-26",
    );
  });

  it("fails closed when the persisted weekly certification seal is absent", async () => {
    const rows = week.dates.map((date) => rowForDate(date));
    const state = await loadReaderSummaryWeeklyProductionDbState(
      fakeClient(rows, { sealRows: [] }),
      scope,
      week,
    );

    expect(state.status).toBe("partial");
    expect(state.weeklyCertificationSeal).toBeNull();
    expect(state.blockingReasons).toContain(
      "missing persisted DB weekly certification seal",
    );
  });

  it("rejects a forged persisted weekly certification seal", async () => {
    const rows = week.dates.map((date) => rowForDate(date));
    const forged = { ...sealRowFor(rows), seal_sha256: "b".repeat(64) };

    await expect(
      loadReaderSummaryWeeklyProductionDbState(
        fakeClient(rows, { sealRows: [forged] }),
        scope,
        week,
      ),
    ).rejects.toThrow("persisted DB certification seal diverged");
  });

  it("rejects a seal for the wrong tenant, workspace or week", async () => {
    const rows = week.dates.map((date) => rowForDate(date));
    const persisted = sealRowFor(rows);
    const wrongSeals = [
      { ...persisted, tenant_id: "33333333-3333-4333-8333-333333333333" },
      { ...persisted, workspace_id: "44444444-4444-4444-8444-444444444444" },
      { ...persisted, week_started_on: "2026-07-13" },
    ];

    for (const wrongSeal of wrongSeals) {
      await expect(
        loadReaderSummaryWeeklyProductionDbState(
          fakeClient(rows, { sealRows: [wrongSeal] }),
          scope,
          week,
        ),
      ).rejects.toThrow("persisted DB certification seal diverged");
    }
  });

  it("rejects a non-exact 7/7 Monday-Sunday seal", async () => {
    const rows = week.dates.map((date) => rowForDate(date));
    const incomplete = sealRowFor(rows.slice(0, 6));

    await expect(
      loadReaderSummaryWeeklyProductionDbState(
        fakeClient(rows, { sealRows: [incomplete] }),
        scope,
        week,
      ),
    ).rejects.toThrow("must contain exact 7/7 days");
  });

  it("rejects a stale persisted seal that no longer binds daily evidence", async () => {
    const rows = week.dates.map((date) => rowForDate(date));
    const staleRows = rows.map((row, index) =>
      index === 0 ? { ...row, publication_id: "publication:stale" } : row,
    );

    await expect(
      loadReaderSummaryWeeklyProductionDbState(
        fakeClient(rows, { sealRows: [sealRowFor(staleRows)] }),
        scope,
        week,
      ),
    ).rejects.toThrow("stale or mismatched");
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

  it.each(["1", "2", "3", "4", "5", "6", "7", "8"])(
    "accepts RFC-compatible UUID version %s scope",
    async (version) => {
      const versionedScope = {
        tenantId: `00000000-0000-${version}000-8000-000000006101`,
        workspaceId: `00000000-0000-${version}000-8000-000000006102`,
        scope: { type: "workspace" as const },
      };

      const state = await loadReaderSummaryWeeklyProductionDbState(
        fakeClient([]),
        versionedScope,
        week,
      );

      expect(state.scope).toEqual(versionedScope);
    },
  );

  it("rejects non-UUID production scope text", async () => {
    await expect(
      loadReaderSummaryWeeklyProductionDbState(
        fakeClient([]),
        { ...scope, tenantId: "production-tenant" },
        week,
      ),
    ).rejects.toThrow("Reader summary weekly tenant id must be a UUID");
  });

  it("sets transaction-local tenant RLS context around weekly reads", async () => {
    const queries: QueryCall[] = [];
    const connection = transactionConnection(queries);

    await expect(
      withReaderSummaryWeeklyProductionDatabaseAccess(
        {
          async connect() {
            return connection;
          },
        },
        { kind: "tenant", tenantId, workspaceId },
        async (client) => {
          await client.query("SELECT weekly_evidence");
          return "complete";
        },
      ),
    ).resolves.toBe("complete");

    expect(queries.map((query) => query.sql)).toEqual([
      "BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE",
      expect.stringContaining(
        "set_config('social_monitor.tenant_id', $1, true)",
      ),
      "SELECT weekly_evidence",
      "COMMIT",
    ]);
    expect(queries[1]?.values).toEqual([tenantId, workspaceId, "false"]);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it("uses explicit system context for unscoped capability checks", async () => {
    const queries: QueryCall[] = [];
    const connection = transactionConnection(queries);

    await withReaderSummaryWeeklyProductionDatabaseAccess(
      {
        async connect() {
          return connection;
        },
      },
      { kind: "system" },
      async () => undefined,
    );

    expect(queries[1]?.values).toEqual(["", "", "true"]);
  });

  it("rolls back and releases a failed weekly database operation", async () => {
    const queries: QueryCall[] = [];
    const connection = transactionConnection(queries);

    await expect(
      withReaderSummaryWeeklyProductionDatabaseAccess(
        {
          async connect() {
            return connection;
          },
        },
        { kind: "tenant", tenantId, workspaceId },
        async () => {
          throw new Error("daily publications unavailable");
        },
      ),
    ).rejects.toThrow("daily publications unavailable");

    expect(queries.at(-1)?.sql).toBe("ROLLBACK");
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it.each(["40001", "40P01"])(
    "retries PostgreSQL conflict %s in a fresh scoped transaction",
    async (code) => {
      const firstQueries: QueryCall[] = [];
      const secondQueries: QueryCall[] = [];
      const first = transactionConnection(firstQueries, code);
      const second = transactionConnection(secondQueries);
      const connections = [first, second];
      let operations = 0;

      await expect(
        withReaderSummaryWeeklyProductionDatabaseAccess(
          {
            async connect() {
              const connection = connections.shift();
              if (connection === undefined) {
                throw new Error("unexpected weekly retry");
              }
              return connection;
            },
          },
          { kind: "tenant", tenantId, workspaceId },
          async (client) => {
            operations += 1;
            await client.query("SELECT weekly_evidence");
            return "complete";
          },
        ),
      ).resolves.toBe("complete");

      expect(operations).toBe(2);
      expect(firstQueries.map((query) => query.sql)).toEqual([
        "BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE",
        expect.stringContaining(
          "set_config('social_monitor.tenant_id', $1, true)",
        ),
        "SELECT weekly_evidence",
        "COMMIT",
        "ROLLBACK",
      ]);
      expect(secondQueries.map((query) => query.sql)).toEqual([
        "BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE",
        expect.stringContaining(
          "set_config('social_monitor.tenant_id', $1, true)",
        ),
        "SELECT weekly_evidence",
        "COMMIT",
      ]);
      expect(first.release).toHaveBeenCalledTimes(1);
      expect(second.release).toHaveBeenCalledTimes(1);
    },
  );
});

type FakeRow = ReturnType<typeof rowForDate>;
type QueryCall = Readonly<{ sql: string; values?: readonly unknown[] }>;

const transactionConnection = (
  queries: QueryCall[],
  commitErrorCode?: string,
): ReaderSummaryWeeklyProductionPostgresConnection => ({
  release: jest.fn(),
  async query(sql, values) {
    queries.push({ sql, ...(values === undefined ? {} : { values }) });
    if (sql === "COMMIT" && commitErrorCode !== undefined) {
      throw Object.assign(new Error("weekly transaction conflict"), {
        code: commitErrorCode,
      });
    }
    return { rows: [] };
  },
});

const fakeClient = (
  rows: readonly FakeRow[],
  options: Readonly<{
    backfillFunction?: string | null;
    secureBackfill?: boolean;
    secureSlotPrepare?: boolean;
    sealRows?: readonly Record<string, unknown>[];
  }> = {},
): ReaderSummaryWeeklyProductionPostgresClient => ({
  async query<TRow extends Record<string, unknown>>(sql: string) {
    if (sql.includes("to_regclass")) {
      return {
        rows: [
          {
            evidence_table: "reader_summary_weekly_publication_evidence",
            publish_function: "publish_reader_summary(jsonb)",
            backfill_function:
              options.backfillFunction === undefined
                ? "backfill_reader_summary_weekly_daily_certifications(uuid,uuid,text,text,date)"
                : options.backfillFunction,
            backfill_security_definer:
              options.secureBackfill ?? true,
            backfill_fixed_search_path:
              options.secureBackfill ?? true,
            backfill_owner:
              "social_monitor_reader_summary_publication_owner",
            backfill_runtime_execute:
              options.secureBackfill ?? true,
            backfill_public_execute:
              !(options.secureBackfill ?? true),
            slot_prepare_function:
              "prepare_reader_summary_weekly_production_slot(uuid,uuid,text,text,date)",
            slot_prepare_security_definer:
              options.secureSlotPrepare ?? true,
            slot_prepare_fixed_search_path:
              options.secureSlotPrepare ?? true,
            slot_prepare_owner:
              "social_monitor_reader_summary_publication_owner",
            slot_prepare_runtime_execute:
              options.secureSlotPrepare ?? true,
            slot_prepare_public_execute:
              !(options.secureSlotPrepare ?? true),
            column_count: "28",
          },
        ] as unknown as readonly TRow[],
      };
    }
    if (sql.includes("FROM reader_summary_weekly_certification_seals")) {
      const sealRows = options.sealRows ??
        (rows.length === 7 ? [sealRowFor(rows)] : []);
      return { rows: sealRows as unknown as readonly TRow[] };
    }
    return { rows: rows as unknown as readonly TRow[] };
  },
});

type RowOptions = Readonly<{
  semanticStatus?: "COMPLETED" | "NO_SIGNAL";
  githubMode?:
    | "verified"
    | "ordinary_not_required"
    | "historical_unavailable";
}>;

function rowForDate(date: string, options: RowOptions = {}) {
  const semanticStatus = options.semanticStatus ?? "COMPLETED";
  const githubMode = options.githubMode ?? "verified";
  const githubEvidence = githubEvidenceFor(date, githubMode);
  const providerEvidence =
    semanticStatus === "NO_SIGNAL"
      ? []
      : githubMode === "verified"
        ? [
            ...Array.from({ length: 10 }, (_, index) =>
              evidence(date, "github-trending-page", index),
            ),
            evidence(date, "rss", 10),
          ]
        : [evidence(date, "rss", 0)];
  const canonicalRecord = {
    requestedUtcDate: date,
    semanticStatus,
    githubEvidence,
    providerEvidence,
    providerCounts: readerSummaryWeeklyCanonicalProviderKeys.map(
      (providerKey) => ({
        providerKey,
        count:
          providerKey === "github-trending-page"
            ? githubMode === "verified"
              ? 10
              : 0
            : providerKey === "rss"
              ? semanticStatus === "COMPLETED"
                ? 1
                : 0
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
    semantic_status: semanticStatus,
    report: { status: "ok" },
    exact_proof: { status: "ok" },
    provider_evidence: providerEvidence,
    github_evidence: githubEvidence,
    canonical_record: canonicalRecord,
    canonical_sha256: canonicalSha256,
    identity: `${readerSummaryWeeklyPublicationEvidenceSchemaVersion}:${canonicalSha256}`,
    recorded_at: `${date}T12:00:00.000Z`,
  };
}

function sealRowFor(rows: readonly FakeRow[]) {
  const weekStartedOn = rows[0]?.requested_utc_date ?? week.weekStartedOn;
  const weekEndedOn = new Date(
    Date.parse(`${weekStartedOn}T00:00:00.000Z`) + 6 * 86_400_000,
  ).toISOString().slice(0, 10);
  const days = rows.map((row) => ({
    requestedUtcDate: row.requested_utc_date,
    publicationId: row.publication_id,
    artifactId: row.reader_summary_artifact_id,
    jobId: row.reader_summary_job_id,
    semanticStatus: row.semantic_status,
    publicationEvidenceIdentity: row.identity,
    publicationEvidenceSha256: row.canonical_sha256,
  }));
  const body = {
    schemaVersion: "reader_summary.weekly_certification_seal.v1",
    tenantId,
    workspaceId,
    scopeType: "workspace",
    scopeKey: "workspace",
    weekStartedOn,
    weekEndedOn,
    days,
  };
  const canonical = canonicalizeReaderSummaryWeeklyJson(body);
  const sealId =
    `reader_summary.weekly_certification_seal.v1:${canonical.sha256}`;
  return {
    seal_id: sealId,
    seal_sha256: canonical.sha256,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    scope_type: "workspace",
    scope_key: "workspace",
    week_started_on: weekStartedOn,
    week_ended_on: weekEndedOn,
    days,
    canonical_record: {
      ...body,
      sealId,
      sealSha: canonical.sha256,
    },
    canonical_bytes: canonical.json,
    recorded_at: "2026-07-27T06:00:00.000Z",
  };
}

function rowWithForgedProviderEvidence(
  row: ReturnType<typeof rowForDate>,
  mutate: (item: Record<string, unknown>) => Record<string, unknown>,
) {
  const providerEvidence = row.provider_evidence.map((item, index) =>
    index === 0 ? mutate(item) : item,
  );
  return resealRow(row, {
    providerEvidence,
    githubEvidence: row.github_evidence,
  });
}

function rowWithForgedGitHubEvidence(
  row: ReturnType<typeof rowForDate>,
  changes: Readonly<Record<string, unknown>>,
) {
  const { sha256: oldSha, ...oldBody } = row.github_evidence;
  void oldSha;
  const body = { ...oldBody, ...changes };
  const githubEvidence = {
    ...body,
    sha256: canonicalizeReaderSummaryWeeklyJson(body).sha256,
  };
  return resealRow(row, {
    providerEvidence: row.provider_evidence,
    githubEvidence,
  });
}

function resealRow(
  row: ReturnType<typeof rowForDate>,
  evidence: Readonly<{
    providerEvidence: readonly Readonly<Record<string, unknown>>[];
    githubEvidence: Readonly<Record<string, unknown>>;
  }>,
) {
  const canonicalRecord = {
    ...row.canonical_record,
    providerEvidence: evidence.providerEvidence,
    githubEvidence: evidence.githubEvidence,
  };
  const canonicalSha256 =
    canonicalizeReaderSummaryWeeklyJson(canonicalRecord).sha256;
  return {
    ...row,
    provider_evidence: evidence.providerEvidence,
    github_evidence: evidence.githubEvidence,
    canonical_record: canonicalRecord,
    canonical_sha256: canonicalSha256,
    identity: `${readerSummaryWeeklyPublicationEvidenceSchemaVersion}:${canonicalSha256}`,
  };
}

function githubEvidenceFor(
  date: string,
  mode: NonNullable<RowOptions["githubMode"]>,
) {
  const providerHash = sha(`github-provider:${date}`);
  const repositories =
    mode === "verified"
      ? Array.from({ length: 10 }, (_, index) => ({
          rank: index + 1,
          citationId: `citation:${date}:github:${index}`,
          feedItemId: `feed:${date}:github:${index}`,
          sourceItemId: `source:${date}:github:${index}`,
          repositoryIdentity: `example/repo-${index}`,
          canonicalUrl: `https://github.com/example/repo-${index}`,
          sourceContentHash: sha(`github-source:${date}:${index}`),
          sourceProviderContentHash: providerHash,
        }))
      : [];
  const body = {
    schemaVersion: readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion,
    mode,
    requestedUtcDay: date,
    providerKey: "github-trending-page",
    scanJobId: mode === "verified" ? `scan:${date}` : null,
    sourceBindingId: mode === "verified" ? `binding:${date}` : null,
    evidenceCount: repositories.length,
    historicalUnavailableReason:
      mode === "historical_unavailable"
        ? "Reviewed historical GitHub snapshot was not collected."
        : null,
    authorizedAt:
      mode === "historical_unavailable"
        ? `${nextDate(date)}T00:00:00.000Z`
        : null,
    sourceProviderContentHash: mode === "verified" ? providerHash : null,
    repositories,
  };
  return {
    ...body,
    sha256: canonicalizeReaderSummaryWeeklyJson(body).sha256,
  };
}

function evidence(date: string, providerKey: string, index: number) {
  const github = providerKey === "github-trending-page";
  return {
    citationId: github
      ? `citation:${date}:github:${index}`
      : `citation:${date}:${providerKey}:${index}`,
    citationField: "title",
    feedItemId: github
      ? `feed:${date}:github:${index}`
      : `feed:${date}:${index}`,
    sourceItemId: github
      ? `source:${date}:github:${index}`
      : `source-item:${date}:${index}`,
    sourceBindingId: `binding:${date}:${index}`,
    providerKey,
    providerItemId: `provider-item:${date}:${index}`,
    canonicalUrl: github
      ? `https://github.com/example/repo-${index}`
      : `https://example.com/${providerKey}/${date}/${index}`,
    title: `Durable weekly evidence ${providerKey} ${date}`,
    sourceText: `Evidence body for ${providerKey} on ${date} with enough stable source context.`,
    publishedAt: `${date}T08:00:00.000Z`,
    observedAt: `${date}T09:00:00.000Z`,
    sourceContentHash: github
      ? sha(`github-source:${date}:${index}`)
      : sha(`${providerKey}:${date}:${index}`),
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
