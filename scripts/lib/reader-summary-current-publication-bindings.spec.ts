import type { Pool } from "pg";

import {
  buildCurrentPublicArtifactSnapshot,
  currentPublicArtifactBindingsQuery,
  databaseFingerprintLabel,
  readCurrentPublicArtifactSnapshot,
} from "./reader-summary-current-publication-bindings";
import {
  canonicalJsonSha256,
  dailyPeriodKey,
} from "./reader-summary-quality-eval-support";

jest.mock("./reader-summary-multi-day-actual-day", () => ({
  actualDayAndProjectionFromRecord: (collectionDate: string, record: {
    readonly modelVersion: string;
    readonly promptVersion: string;
  }) => ({
    actualDay: {
      collectionDate,
      modelVersion: record.modelVersion,
      promptVersion: record.promptVersion,
      rankingPolicyVersion: "story_ranking_v8",
      storyClusters: [],
      topReadEntries: [],
      narrativeSections: [],
    },
    actualDayProjectionSha256: "9".repeat(64),
  }),
}));

describe("current public reader-summary bindings", () => {
  it("uses one repeatable-read read-only transaction and exact joins", async () => {
    const rows = fixtureRows();
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const pool = {
      connect: jest.fn().mockResolvedValue({ query, release }),
    } as unknown as Pick<Pool, "connect">;

    const snapshot = await readCurrentPublicArtifactSnapshot({
      pool,
      databaseUrl: databaseUrl(),
      scope: scope(),
      collectionDates: dates(),
    });

    expect(query.mock.calls.map((call) => call[0])).toEqual([
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      "SET LOCAL statement_timeout = '60s'",
      currentPublicArtifactBindingsQuery,
      "COMMIT",
    ]);
    expect(query.mock.calls[2]?.[1]).toEqual([
      scope().tenantId,
      scope().workspaceId,
      scope().scopeKey,
      dates(),
    ]);
    expect(currentPublicArtifactBindingsQuery).toContain(
      "slot.current_publication_id",
    );
    expect(currentPublicArtifactBindingsQuery).toContain(
      "artifact.id = publication.reader_summary_artifact_id",
    );
    expect(currentPublicArtifactBindingsQuery).toContain(
      'transaction_timestamp() as "capturedAt"',
    );
    expect(snapshot.capturedAt).toBe("2026-07-21T00:10:00.000Z");
    expect(snapshot.targets).toHaveLength(5);
    expect(snapshot.targets[0]).toMatchObject({
      publicationId: uuid(10),
      artifactId: uuid(20),
      actualDayProjectionSha256: "9".repeat(64),
    });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rolls back, releases, and fails closed when PostgreSQL is unavailable", async () => {
    const unavailable = new Error("connection refused");
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const pool = {
      connect: jest.fn().mockResolvedValue({ query, release }),
    } as unknown as Pick<Pool, "connect">;

    await expect(
      readCurrentPublicArtifactSnapshot({
        pool,
        databaseUrl: databaseUrl(),
        scope: scope(),
        collectionDates: dates(),
      }),
    ).rejects.toBe(unavailable);
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rejects stale current slots, proof drift, and mixed profiles", () => {
    const rows = fixtureRows();
    expect(() =>
      buildCurrentPublicArtifactSnapshot({
        rows: rows.slice(0, 4),
        databaseUrl: databaseUrl(),
        scope: scope(),
        collectionDates: dates(),
      }),
    ).toThrow("do not cover every requested date");

    const proofDrift = cloneRows(rows);
    proofDrift[0]!.proofSha256 = "f".repeat(64);
    expect(() =>
      buildCurrentPublicArtifactSnapshot({
        rows: proofDrift,
        databaseUrl: databaseUrl(),
        scope: scope(),
        collectionDates: dates(),
      }),
    ).toThrow("exact proof drifted");

    const wrongRequestedDate = cloneRows(rows);
    wrongRequestedDate[0]!.exactProof.requestedUtcDate = "2026-07-15";
    wrongRequestedDate[0]!.publicationRequestedUtcDate = "2026-07-15";
    wrongRequestedDate[0]!.proofSha256 = canonicalJsonSha256(
      wrongRequestedDate[0]!.exactProof,
    );
    expect(() =>
      buildCurrentPublicArtifactSnapshot({
        rows: wrongRequestedDate,
        databaseUrl: databaseUrl(),
        scope: scope(),
        collectionDates: dates(),
      }),
    ).toThrow("exact proof drifted");

    const reportDrift = cloneRows(rows);
    reportDrift[0]!.headline = "Mutated after publication";
    expect(() =>
      buildCurrentPublicArtifactSnapshot({
        rows: reportDrift,
        databaseUrl: databaseUrl(),
        scope: scope(),
        collectionDates: dates(),
      }),
    ).toThrow("report hash drifted");

    const mixedProfile = cloneRows(rows);
    mixedProfile[4]!.promptVersion = "reader_summary.prompt.drifted";
    mixedProfile[4]!.reportSha256 = canonicalJsonSha256({
      schemaVersion: "reader_summary.publication_report.v1",
      semanticStatus: mixedProfile[4]!.status,
      modelVersion: mixedProfile[4]!.modelVersion,
      promptVersion: mixedProfile[4]!.promptVersion,
      headline: mixedProfile[4]!.headline,
      summaryText: mixedProfile[4]!.summaryText,
      artifactPayload: mixedProfile[4]!.artifactPayload,
      citations: mixedProfile[4]!.citations,
      qualitySignals: mixedProfile[4]!.qualitySignals,
    });
    mixedProfile[4]!.exactProof.reportSha256 = mixedProfile[4]!.reportSha256;
    mixedProfile[4]!.proofSha256 = canonicalJsonSha256(
      mixedProfile[4]!.exactProof,
    );
    expect(() =>
      buildCurrentPublicArtifactSnapshot({
        rows: mixedProfile,
        databaseUrl: databaseUrl(),
        scope: scope(),
        collectionDates: dates(),
      }),
    ).toThrow("uniform generation profile");

    const captured = buildCurrentPublicArtifactSnapshot({
      rows,
      databaseUrl: databaseUrl(),
      scope: scope(),
      collectionDates: dates(),
    });
    const expectedManifest = {
      schemaVersion: 4 as const,
      artifactFormat: "reader-summary-multi-day-quality-target-manifest-v4" as const,
      databaseFingerprint: captured.databaseFingerprint,
      capturedAt: captured.capturedAt,
      currentAtCapture: true as const,
      generationProfile: captured.generationProfile,
      scope: scope(),
      targets: captured.targets.map((target, index) =>
        index === 0 ? { ...target, reportSha256: "e".repeat(64) } : target,
      ),
    };
    expect(() =>
      buildCurrentPublicArtifactSnapshot({
        rows,
        databaseUrl: databaseUrl(),
        scope: scope(),
        collectionDates: dates(),
        expectedManifest,
      }),
    ).toThrow("drifted from target manifest");
  });

  it("accepts an exact historical publication requested after its target day", () => {
    const rows = cloneRows(fixtureRows());
    const historical = rows[0]!;
    const requestedAt = "2026-07-21T00:01:00.000Z";
    historical.publicationRequestedUtcDate = historical.collectionDate;
    historical.publicationRequestedAt = new Date(requestedAt);
    historical.exactProof.requestedUtcDate = historical.collectionDate;
    historical.exactProof.requestedAt = requestedAt;
    historical.proofSha256 = canonicalJsonSha256(historical.exactProof);

    expect(() =>
      buildCurrentPublicArtifactSnapshot({
        rows,
        databaseUrl: databaseUrl(),
        scope: scope(),
        collectionDates: dates(),
      }),
    ).not.toThrow();
  });

  it("rejects a different database and slots replaced after capture", () => {
    const rows = fixtureRows();
    const captured = buildCurrentPublicArtifactSnapshot({
      rows,
      databaseUrl: databaseUrl(),
      scope: scope(),
      collectionDates: dates(),
    });
    const expectedManifest = {
      schemaVersion: 4 as const,
      artifactFormat: "reader-summary-multi-day-quality-target-manifest-v4" as const,
      databaseFingerprint: captured.databaseFingerprint,
      capturedAt: captured.capturedAt,
      currentAtCapture: true as const,
      generationProfile: captured.generationProfile,
      scope: scope(),
      targets: captured.targets,
    };

    expect(() =>
      buildCurrentPublicArtifactSnapshot({
        rows,
        databaseUrl:
          "postgresql://quality:password@other-db.example.test:25060/social_monitor",
        scope: scope(),
        collectionDates: dates(),
        expectedManifest,
      }),
    ).toThrow("database differs from target manifest capture");

    const replacedSlot = cloneRows(rows);
    replacedSlot[0]!.publicationId = uuid(99);
    expect(() =>
      buildCurrentPublicArtifactSnapshot({
        rows: replacedSlot,
        databaseUrl: databaseUrl(),
        scope: scope(),
        collectionDates: dates(),
        expectedManifest,
      }),
    ).toThrow("artifact bindings drifted from target manifest");
  });

  it("never upgrades a legacy artifact row without an exact publication proof", () => {
    const legacyArtifactOnly = cloneRows(fixtureRows());
    (
      legacyArtifactOnly[0] as unknown as { exactProof: unknown }
    ).exactProof = null;
    legacyArtifactOnly[0]!.proofSha256 = canonicalJsonSha256(null);

    expect(() =>
      buildCurrentPublicArtifactSnapshot({
        rows: legacyArtifactOnly,
        databaseUrl: databaseUrl(),
        scope: scope(),
        collectionDates: dates(),
      }),
    ).toThrow("exact proof drifted");
    expect(currentPublicArtifactBindingsQuery).toContain(
      "publication.publication_kind = 'EXACT'",
    );
    expect(currentPublicArtifactBindingsQuery).toContain(
      "publication.semantic_status = 'COMPLETED'",
    );
  });

  it("emits a credential-free stable database fingerprint", () => {
    const left = databaseFingerprintLabel(databaseUrl());
    const right = databaseFingerprintLabel(
      "postgresql://other:password@db.example.test:25060/social_monitor?sslmode=verify-full",
    );

    expect(left).toBe(right);
    expect(left).toMatch(/^postgres-sha256:[0-9a-f]{64}$/u);
    expect(left).not.toContain("secret");
    expect(databaseFingerprintLabel(
      "postgresql://user:password@db.example.test:25060/other_database",
    )).not.toBe(left);
  });
});

function fixtureRows() {
  return dates().map((collectionDate, index) => {
    const artifactId = uuid(index + 20);
    const modelVersion = "codex:gpt-5.5:xhigh";
    const promptVersion = "reader_summary.prompt.agent_runtime.v10";
    const headline = "Private fixture headline";
    const summaryText = "Private fixture summary";
    const artifactPayload = {
      lineage: { rankingPolicyVersion: "story_ranking_v8" },
    };
    const citations: unknown[] = [];
    const qualitySignals = {};
    const reportSha256 = canonicalJsonSha256({
      schemaVersion: "reader_summary.publication_report.v1",
      semanticStatus: "COMPLETED",
      modelVersion,
      promptVersion,
      headline,
      summaryText,
      artifactPayload,
      citations,
      qualitySignals,
    });
    const requestedAt = nextDate(collectionDate).replace(
      "00:00:00.000Z",
      "00:00:01.000Z",
    );
    const requestedUtcDate = requestedAt.slice(0, 10);
    const readerSummaryJobId = uuid(index + 30);
    const exactProof = {
      schemaVersion: "reader_summary.publication_proof.v1",
      tenantId: scope().tenantId,
      workspaceId: scope().workspaceId,
      scope: { type: "workspace", key: scope().scopeKey },
      period: {
        cadence: "daily",
        startedAt: `${collectionDate}T00:00:00.000Z`,
        endedAt: nextDate(collectionDate),
        timezone: "UTC",
        periodKey: dailyPeriodKey(collectionDate),
      },
      requestedUtcDate,
      requestedAt,
      readerSummaryJobId,
      readerSummaryArtifactId: artifactId,
      semanticStatus: "COMPLETED",
      modelVersion,
      reportSha256,
    };
    const now = new Date("2026-07-21T00:10:00.000Z");
    return {
      collectionDate,
      capturedAt: now,
      publicationId: uuid(index + 10),
      reportSha256,
      proofSha256: canonicalJsonSha256(exactProof),
      exactProof,
      publicationRequestedUtcDate: requestedUtcDate,
      publicationRequestedAt: new Date(requestedAt),
      publicationReaderSummaryJobId: readerSummaryJobId,
      id: artifactId,
      tenantId: scope().tenantId,
      workspaceId: scope().workspaceId,
      scopeType: "workspace",
      scopeKey: scope().scopeKey,
      interestId: null,
      cadence: "daily",
      periodStartedAt: new Date(`${collectionDate}T00:00:00.000Z`),
      periodEndedAt: new Date(nextDate(collectionDate)),
      periodTimezone: "UTC",
      periodKey: dailyPeriodKey(collectionDate),
      userId: null,
      subscriptionId: null,
      status: "COMPLETED" as const,
      schemaVersion: 1,
      modelVersion,
      promptVersion,
      headline,
      summaryText,
      artifactPayload,
      citations,
      qualitySignals,
      createdAt: now,
      updatedAt: now,
    };
  });
}

function cloneRows(rows: ReturnType<typeof fixtureRows>): ReturnType<typeof fixtureRows> {
  return rows.map((row) => ({
    ...row,
    exactProof: JSON.parse(JSON.stringify(row.exactProof)) as typeof row.exactProof,
    artifactPayload: JSON.parse(
      JSON.stringify(row.artifactPayload),
    ) as typeof row.artifactPayload,
  }));
}

function scope() {
  const workspaceId = "00000000-0000-7000-8000-000000000002";
  return {
    tenantId: "00000000-0000-7000-8000-000000000001",
    workspaceId,
    scopeType: "workspace" as const,
    scopeKey: "workspace" as const,
  };
}

function dates(): readonly string[] {
  return [
    "2026-07-16",
    "2026-07-17",
    "2026-07-18",
    "2026-07-19",
    "2026-07-20",
  ];
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function databaseUrl(): string {
  return "postgresql://quality:password@db.example.test:25060/social_monitor?sslmode=require";
}

function uuid(value: number): string {
  return `00000000-0000-7000-8000-${String(value).padStart(12, "0")}`;
}
