import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  ensureSecureHistoricalDegradedRecoveryAuthorityParent,
  historicalDegradedRecoveryReason,
  installHistoricalDegradedRecoveryAuthority,
  prepareHistoricalDegradedRecoveryAuthority,
  readSecureHistoricalDegradedRecoveryFile,
  sha256,
  verifyHistoricalDegradedRecoveryAuthorityBytes,
  type HistoricalDegradedRecoveryPreparation,
} from "./reader-summary-historical-degraded-recovery-authority";

describe("historical degraded recovery authority", () => {
  it.each([
    ["2026-08-18", 277],
    ["2026-08-19", 303],
  ] as const)("prepares canonical authority for %s", (date, count) => {
    const prepared = prepareHistoricalDegradedRecoveryAuthority(
      preparation(date, count),
    );

    expect(prepared.authority).toMatchObject({
      artifactFormat:
        "reader-summary-historical-degraded-recovery-authority-v1",
      requestedUtcDate: date,
      expectedCounts: { live: count, unique: count },
      safeReason: historicalDegradedRecoveryReason,
      attempt: { kind: "historical-degraded-recovery" },
      githubZero: {
        scannedItemCount: 160,
        touchingRequestedDayCount: 0,
        firstLaterObservation: "2026-08-20T00:01:00.000Z",
      },
    });
    expect(
      verifyHistoricalDegradedRecoveryAuthorityBytes({
        bytes: prepared.bytes,
        expectedSha256: prepared.sha256,
      }),
    ).toEqual(prepared.authority);
  });

  it("installs create-only and replays only byte-identical authority", () => {
    const directory = mkdtempSync(join(tmpdir(), "historical-degraded-"));
    const path = join(directory, "authority.json");
    const first = prepareHistoricalDegradedRecoveryAuthority(
      preparation("2026-08-18", 277),
    );
    const different = prepareHistoricalDegradedRecoveryAuthority({
      ...preparation("2026-08-18", 277),
      authorizedAt: new Date("2026-08-22T12:01:00.000Z"),
    });

    expect(installHistoricalDegradedRecoveryAuthority({ path, bytes: first.bytes }))
      .toBe("installed");
    expect(installHistoricalDegradedRecoveryAuthority({ path, bytes: first.bytes }))
      .toBe("replayed");
    expect(readFileSync(path)).toEqual(first.bytes);
    expect(() =>
      installHistoricalDegradedRecoveryAuthority({ path, bytes: different.bytes }),
    ).toThrow("different bytes");
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

  it("rejects symlinked and writable authority replay files", () => {
    const directory = mkdtempSync(join(tmpdir(), "historical-degraded-input-"));
    const target = join(directory, "target.json");
    const link = join(directory, "authority.json");
    const prepared = prepareHistoricalDegradedRecoveryAuthority(
      preparation("2026-08-18", 277),
    );
    writeFileSync(target, prepared.bytes, { mode: 0o400 });
    symlinkSync(target, link);
    expect(() => installHistoricalDegradedRecoveryAuthority({
      path: link,
      bytes: prepared.bytes,
    })).toThrow("non-symlink");
    chmodSync(target, 0o620);
    expect(() => installHistoricalDegradedRecoveryAuthority({
      path: target,
      bytes: prepared.bytes,
    })).toThrow("group/world writable");
    const realDirectory = join(directory, "real-directory");
    const linkedDirectory = join(directory, "linked-directory");
    mkdirSync(realDirectory);
    writeFileSync(join(realDirectory, "input.json"), Buffer.from("{}"), {
      mode: 0o400,
    });
    symlinkSync(realDirectory, linkedDirectory);
    expect(() => readSecureHistoricalDegradedRecoveryFile(
      join(linkedDirectory, "input.json"),
      "dataset manifest",
    )).toThrow("path must not contain symlinks");
    expect(() => ensureSecureHistoricalDegradedRecoveryAuthorityParent(
      join(linkedDirectory, "nested", "authority.json"),
    )).toThrow("must not contain symlinks");
    expect(() => installHistoricalDegradedRecoveryAuthority({
      path: join(linkedDirectory, "authority.json"),
      bytes: prepared.bytes,
    })).toThrow("must not contain symlinks");
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
    : { "hacker-news": 99, reddit: 90, rss: 27, "x-twitter": 87 },
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
