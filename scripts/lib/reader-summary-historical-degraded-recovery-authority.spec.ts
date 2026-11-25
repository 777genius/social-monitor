import {
  assertHistoricalDegradedRecoveryXBackfillReceipt,
  historicalDegradedRecoveryEvidencePath,
  historicalDegradedRecoveryExpectedDataset,
  historicalDegradedRecoveryReason,
  prepareHistoricalDegradedRecoveryAuthority,
  sha256,
  verifyHistoricalDegradedRecoveryAuthorityBytes,
  type HistoricalDegradedRecoveryPreparation,
} from "./reader-summary-historical-degraded-recovery-authority";

describe("historical degraded recovery authority", () => {
  it("rejects inherited property names as recovery dates", () => {
    expect(() => historicalDegradedRecoveryExpectedDataset("constructor"))
      .toThrow("not allowlisted");
  });

  it.each([
    ["2026-08-18", 277],
    ["2026-08-19", 304],
  ] as const)("prepares canonical authority for %s", (date, count) => {
    const prepared = prepareHistoricalDegradedRecoveryAuthority(
      preparation(date, count),
    );

    expect(prepared.authority).toMatchObject({
      artifactFormat:
        "reader-summary-historical-degraded-recovery-authority-v2",
      requestedUtcDate: date,
      expectedCounts: { live: count, unique: count },
      safeReason: historicalDegradedRecoveryReason,
      attempt: { kind: "historical-degraded-recovery" },
      githubZero: {
        scannedItemCount: 160,
        touchingRequestedDayCount: 0,
        firstLaterObservation: "2026-08-20T00:01:00.000Z",
      },
      inputs: {
        xBackfillReceipt: {
          rowCount: date === "2026-08-18" ? 72 : 77,
        },
      },
    });
    expect(
      verifyHistoricalDegradedRecoveryAuthorityBytes({
        bytes: prepared.bytes,
        expectedSha256: prepared.sha256,
      }),
    ).toEqual(prepared.authority);
  });

  it("binds the immutable X-backfill receipt into authority identity", () => {
    const base = preparation("2026-08-18", 277);
    const original = prepareHistoricalDegradedRecoveryAuthority(base);
    const mutated = prepareHistoricalDegradedRecoveryAuthority({
      ...base,
      xBackfillReceiptBytes: xBackfillReceipt("2026-08-18", "mutated"),
    });

    expect(original.authority.inputs.xBackfillReceipt).toEqual({
      artifactFormat: "reader-summary-historical-x-backfill-receipt-v1",
      rowCount: 72,
      sha256: sha256(base.xBackfillReceiptBytes),
    });
    expect(mutated.sha256).not.toBe(original.sha256);
    expect(mutated.authority.attempt.identity).not.toBe(
      original.authority.attempt.identity,
    );
    expect(() => assertHistoricalDegradedRecoveryXBackfillReceipt({
      authority: original.authority,
      bytes: base.xBackfillReceiptBytes,
    })).not.toThrow();
    expect(() => assertHistoricalDegradedRecoveryXBackfillReceipt({
      authority: original.authority,
      bytes: xBackfillReceipt("2026-08-18", "mutated"),
    })).toThrow("receipt binding");
  });

  it("rejects X-backfill receipts without the exact unique 72/77 rows", () => {
    const base = preparation("2026-08-18", 277);
    const parsed = JSON.parse(base.xBackfillReceiptBytes.toString("utf8")) as {
      insertedRowCount: number;
      rows: unknown[];
    };
    for (const receipt of [
      { ...parsed, insertedRowCount: 71 },
      { ...parsed, rows: parsed.rows.slice(0, 71) },
      { ...parsed, rows: parsed.rows.map(() => ({ sourceItemId: "same" })) },
    ]) {
      expect(() => prepareHistoricalDegradedRecoveryAuthority({
        ...base,
        xBackfillReceiptBytes: Buffer.from(JSON.stringify(receipt)),
      })).toThrow("receipt row contract");
    }
  });

  it("derives every evidence file below the fixed artifact root", () => {
    expect(historicalDegradedRecoveryEvidencePath(
      "2026-08-19",
      "x-backfill-receipt",
    )).toBe(
      "/var/lib/social-monitor/artifacts/reader-summary/historical-degraded-recovery/2026-08-19/x-backfill-receipt.json",
    );
    expect(() => historicalDegradedRecoveryEvidencePath(
      "2026-08-20",
      "authority",
    )).toThrow("not allowlisted");
  });

  it("allows zero or any count of unrelated later GitHub rows", () => {
    const base = preparation("2026-08-18", 277);
    const zeroRows = { ...base.githubZero };
    Reflect.deleteProperty(zeroRows, "firstLaterObservation");
    expect(() => prepareHistoricalDegradedRecoveryAuthority(base)).not.toThrow();
    expect(() => prepareHistoricalDegradedRecoveryAuthority({
      ...base,
      githubZero: { ...base.githubZero, scannedItemCount: 150 },
    })).not.toThrow();
    expect(() => prepareHistoricalDegradedRecoveryAuthority({
      ...base,
      githubZero: {
        ...zeroRows,
        scannedItemCount: 0,
      },
    })).not.toThrow();
  });

  it("changes authority identity when the canonical projection hash changes", () => {
    const base = preparation("2026-08-18", 277);
    const original = prepareHistoricalDegradedRecoveryAuthority(base);
    const mutated = prepareHistoricalDegradedRecoveryAuthority({
      ...base,
      githubZero: {
        ...base.githubZero,
        projectionSha256: sha256("timestamp-or-identity-mutated"),
      },
    });
    expect(mutated.sha256).not.toBe(original.sha256);
    expect(mutated.authority.attempt.identity).not.toBe(
      original.authority.attempt.identity,
    );
  });


  it.each([
    ["another date", { requestedUtcDate: "2026-08-20" }],
    ["ambiguous source", { sourceCandidates: [] }],
    ["active slot", { activeSlotCount: 1 }],
    ["dataset drift", { dataset: buildDataset("2026-08-18", 276) }],
    ["provider drift", {
      dataset: {
        ...buildDataset("2026-08-18", 277),
        providerCounts: {
          "hacker-news": 100,
          reddit: 78,
          rss: 27,
          "x-twitter": 72,
        },
      },
    }],
    ["GitHub day data", { githubZero: buildGithubZero(1) }],
    ["negative GitHub scan count", {
      githubZero: { ...buildGithubZero(0), scannedItemCount: -1 },
    }],
    ["unsafe GitHub scan count", {
      githubZero: {
        ...buildGithubZero(0),
        scannedItemCount: Number.MAX_SAFE_INTEGER + 1,
      },
    }],
    ["invalid GitHub page count", {
      githubZero: { ...buildGithubZero(0), pageCount: 0 },
    }],
    ["incomplete observation window", {
      githubZero: {
        ...buildGithubZero(0),
        observedThrough: "2026-08-18T23:59:59.999Z",
      },
    }],
  ])("rejects %s", (_label, override) => {
    expect(() =>
      prepareHistoricalDegradedRecoveryAuthority({
        ...preparation("2026-08-18", 277),
        ...override,
      } as HistoricalDegradedRecoveryPreparation),
    ).toThrow();
  });

  it("rejects non-GitHub blockers, flags, missing content, and reader failure", () => {
    const base = preparation("2026-08-18", 277);
    const source = base.sourceCandidates[0]!;
    const rejected = [
      { ...source, qualityFlags: ["low_confidence"] },
      { ...source, summaryText: "" },
      {
        ...source,
        publicationDecision: {
          ...source.publicationDecision,
          reasonCodes: ["editorial_quality"],
        },
      },
    ];
    for (const candidate of rejected) {
      expect(() =>
        prepareHistoricalDegradedRecoveryAuthority({
          ...base,
          sourceCandidates: [candidate],
        }),
      ).toThrow("source rejection");
    }
    expect(() =>
      prepareHistoricalDegradedRecoveryAuthority({
        ...base,
        githubZero: { ...base.githubZero, readerStatus: "failed" } as never,
      }),
    ).toThrow("GitHub zero");
  });
});

const preparation = (
  requestedUtcDate: "2026-08-18" | "2026-08-19",
  count: number,
): HistoricalDegradedRecoveryPreparation => ({
  requestedUtcDate,
  sourceCandidates: [
    {
      jobId: "00000000-0000-7000-8000-000000000111",
      artifactId: "00000000-0000-7000-8000-000000000112",
      jobStatus: "REJECTED",
      artifactStatus: "REJECTED",
      qualityFlags: [],
      publicationDecision: {
        status: "rejected",
        reasonCodes: [
          "github_projection_missing",
          "github_projection_mixed",
          "github_projection_gapped",
        ],
        findings: [
          { code: "github_projection_missing", reason: "No requested-day projection." },
        ],
      },
      summaryText: "Already collected non-GitHub summary content.",
      sourceRecordSha256: sha256("source-row"),
    },
  ],
  existingPublicationCount: 0,
  activeSlotCount: 0,
  collectionArtifactBytes: Buffer.from("collection"),
  collectionQualityReportBytes: Buffer.from("quality"),
  datasetManifestBytes: Buffer.from("manifest"),
  xBackfillReceiptBytes: xBackfillReceipt(requestedUtcDate),
  dataset: buildDataset(requestedUtcDate, count),
  githubZero: buildGithubZero(0),
  servingAuthority: {
    summaryGenerator: {
      mode: "agent-runtime",
      provider: "codex",
      physicalModel: "gpt-5.6-sol",
      reasoningPolicy: "xhigh",
    },
  },
  authorizedAt: new Date("2026-08-22T12:00:00.000Z"),
});

function xBackfillReceipt(
  requestedUtcDate: "2026-08-18" | "2026-08-19",
  suffix = "exact",
): Buffer {
  const insertedRowCount = requestedUtcDate === "2026-08-18" ? 72 : 77;
  const baseRowCount = requestedUtcDate === "2026-08-18" ? 0 : 10;
  return Buffer.from(JSON.stringify({
    artifactFormat: "reader-summary-historical-x-backfill-receipt-v1",
    tenantId: "00000000-0000-7000-8000-000000006101",
    workspaceId: "00000000-0000-7000-8000-000000006102",
    requestedUtcDate,
    providerKey: "x-twitter",
    baseRowCount,
    insertedRowCount,
    finalRowCount: baseRowCount + insertedRowCount,
    rows: Array.from({ length: insertedRowCount }, (_, index) => ({
      sourceItemId: `${requestedUtcDate}:${index}:${suffix}`,
    })),
  }));
}

function buildDataset(
  date: "2026-08-18" | "2026-08-19",
  count: number,
) {
  return {
  liveCount: count,
  uniqueCount: count,
  aggregateSha256: sha256(`dataset:${count}`),
  providerCounts: date === "2026-08-18"
    ? { "hacker-news": 100, reddit: 79, rss: 26, "x-twitter": 72 }
    : { "hacker-news": 99, reddit: 90, rss: 28, "x-twitter": 87 },
  };
}

function buildGithubZero(touchingRequestedDayCount: number) {
  return {
  readerStatus: "ok" as const,
  observedThrough: "2026-08-22T12:00:00.000Z",
  pageCount: 2,
  scannedItemCount: 160,
  touchingRequestedDayCount: touchingRequestedDayCount as 0,
  eligibleBindingIds: ["00000000-0000-7000-8000-000000000121"],
  firstLaterObservation: "2026-08-20T00:01:00.000Z",
  projectionSha256: sha256("projection"),
  };
}
