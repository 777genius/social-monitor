import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryPublicationDecision,
  ReaderSummaryPublicationPolicy,
} from "../../domain";
import {
  buildReaderSummaryPeriod,
  ReaderSummaryArtifact,
  readerSummaryHasVerifiedGitHubProjection,
  type SummaryEvidenceSelection,
} from "../../domain";
import {
  githubBoardArtifact,
  githubProjectionInput,
} from "../../domain/policies/reader-summary-github-projection-policy.spec-support";
import type {
  ReadReaderSummaryGitHubProjectionQuery,
  ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort,
  ReaderSummaryGitHubProjectionReaderPort,
} from "../../ports";
import { evaluateReaderSummaryPrepublication } from "./reader-summary-prepublication-gate";

describe("evaluateReaderSummaryPrepublication", () => {
  it("fails closed before publication when the durable projection is unavailable", async () => {
    const decision = await evaluateReaderSummaryPrepublication({
      artifact: githubArtifact(),
      evidence: evidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: {
        async read() {
          throw new Error("database unavailable");
        },
      },
      observedThrough,
    });

    expect(decision.publicationDecision).toMatchObject({
      status: "rejected",
      reasonCodes: ["github_projection_unavailable"],
    });
    expect(decision.githubProjectionAudit.status).toBe("rejected");
  });

  it("binds the exact scoped query and permits publication only after verification", async () => {
    let observedQuery: ReadReaderSummaryGitHubProjectionQuery | undefined;
    const reader: ReaderSummaryGitHubProjectionReaderPort = {
      async read(query) {
        observedQuery = query;
        return {
          eligibleBindingIds: ["github-binding-a"],
          items: projectionItems(),
          pageCount: 2,
        };
      },
    };

    const decision = await evaluateReaderSummaryPrepublication({
      artifact: githubArtifact(),
      evidence: evidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: reader,
      observedThrough,
    });

    expect(observedQuery).toEqual({
      tenantId: tenant,
      workspaceId: workspace,
      dayStartedAt,
      dayEndedAt,
      observedThrough,
    });
    expect(decision.publicationDecision.status).toBe("published");
    expect(decision.githubProjectionAudit).toMatchObject({
      status: "verified",
      pageCount: 2,
      eligibleBindingIds: ["github-binding-a"],
      bindings: expect.arrayContaining([
        expect.objectContaining({
          rank: 1,
          providerKey: "github-trending-page",
          metadataKind: "github_trending_page_repository",
          scanJobId: "scan-github-1",
          fetchStartedAt: "2026-07-10T11:59:00.000Z",
          sourceContentHash: "a".repeat(64),
        }),
      ]),
    });
    expect(
      decision.githubProjectionAudit.bindings.map(({ rank }) => rank),
    ).toEqual(Array.from({ length: 10 }, (_, index) => index + 1));
    expect(
      new Set(
        decision.githubProjectionAudit.bindings.map(
          ({ scanJobId }) => scanJobId,
        ),
      ),
    ).toEqual(new Set(["scan-github-1"]));
    expect(
      decision.githubProjectionAudit.bindings.every(
        (binding) =>
          binding.fetchStartedAt <= binding.checkedAt &&
          binding.publishedAt === binding.checkedAt &&
          binding.checkedAt <= binding.observedAt,
      ),
    ).toBe(true);
  });

  it("rejects daily publication with no GitHub evidence when its canonical binding is missing", async () => {
    let readCount = 0;
    const artifact = artifactWithoutGitHubBoard();

    const decision = await evaluateReaderSummaryPrepublication({
      artifact,
      evidence: evidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: {
        async read() {
          readCount += 1;
          return { eligibleBindingIds: [], items: [], pageCount: 1 };
        },
      },
      observedThrough,
    });

    expect(readCount).toBe(1);
    expect(decision.publicationDecision).toMatchObject({
      status: "rejected",
      reasonCodes: ["github_projection_missing"],
    });
    expect(decision.githubProjectionAudit).toMatchObject({
      status: "rejected",
      eligibleBindingIds: [],
      violationCodes: ["github_projection_missing"],
    });
  });

  it("publishes a genuine daily NO_SIGNAL as ordinarily not required", async () => {
    const artifact = ordinaryNoSignalArtifact();
    const decision = await evaluateReaderSummaryPrepublication({
      artifact,
      evidence: evidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: {
        async read() {
          return { eligibleBindingIds: [], items: [], pageCount: 1 };
        },
      },
      observedThrough,
    });

    expect(decision.publicationDecision.status).toBe("published");
    expect(decision.githubProjectionAudit).toMatchObject({
      status: "not_required",
      requestedUtcDay: "2026-07-10",
      pageCount: 1,
      scannedItemCount: 0,
      bindings: [],
    });
    expect(decision.githubProjectionAudit).not.toHaveProperty(
      "historicalOmission",
    );
  });

  it("rejects zero GitHub artifact evidence when an eligible binding exists", async () => {
    const decision = await evaluateReaderSummaryPrepublication({
      artifact: artifactWithoutGitHubBoard(),
      evidence: evidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: {
        async read() {
          return {
            eligibleBindingIds: ["github-binding-a"],
            items: projectionItems(),
            pageCount: 2,
          };
        },
      },
      observedThrough,
    });

    expect(decision.publicationDecision).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["github_projection_missing"]),
    });
  });

  it("permits historical omission with an eligible binding and only later rows", async () => {
    let readCount = 0;
    const artifact = artifactWithoutGitHubBoard();
    const decision = await evaluateReaderSummaryPrepublication({
      artifact,
      evidence: evidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: {
        async read() {
          readCount += 1;
          return {
            eligibleBindingIds: ["github-binding-a"],
            items: githubProjectionInput({
              fetchStartedAt: new Date("2026-07-11T00:01:00.000Z"),
              checkedAt: new Date("2026-07-11T00:02:00.000Z"),
              publishedAt: new Date("2026-07-11T00:02:00.000Z"),
              observedAt: new Date("2026-07-11T00:03:00.000Z"),
            }),
            pageCount: 2,
          };
        },
      },
      observedThrough,
      historicalGitHubOmission: {
        reason: "No timestamp-valid GitHub snapshot exists for this day.",
        authorizedAt: observedThrough,
        readerQuality: "limited_sources",
      },
    });

    expect(readCount).toBe(1);
    expect(decision.publicationDecision.status).toBe("published");
    expect(decision.githubProjectionAudit).toMatchObject({
      status: "not_required",
      requestedUtcDay: "2026-07-10",
      historicalOmission: {
        mode: "github_projection_unavailable_historical",
        reason: "No timestamp-valid GitHub snapshot exists for this day.",
        authorizedAt: observedThrough.toISOString(),
      },
      violationCodes: [],
    });
    expect(
      readerSummaryHasVerifiedGitHubProjection({
        artifact,
        audit: decision.githubProjectionAudit,
      }),
    ).toBe(true);
  });

  it("rejects observed_at omission when a checked-in-day Top10 is observed after midnight", async () => {
    const afterMidnight = new Date("2026-07-11T00:05:00.000Z");
    const decision = await evaluateReaderSummaryPrepublication({
      artifact: artifactWithoutGitHubBoard(),
      evidence: evidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: {
        async read() {
          return {
            eligibleBindingIds: ["github-binding-a"],
            items: githubProjectionInput({ observedAt: afterMidnight }),
            pageCount: 2,
          };
        },
      },
      observedThrough,
      historicalGitHubOmission: {
        reason: "The observed-at manifest has no in-window GitHub rows.",
        authorizedAt: observedThrough,
        readerQuality: "limited_sources",
      },
    });

    expect(decision.publicationDecision).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["github_projection_missing"]),
    });
    expect(decision.githubProjectionAudit).not.toHaveProperty(
      "historicalOmission",
    );
    expect(decision.githubProjectionAudit.scannedItemCount).toBe(10);
  });

  it("fails closed when canonical zero cannot be read for omission", async () => {
    const decision = await evaluateReaderSummaryPrepublication({
      artifact: artifactWithoutGitHubBoard(),
      evidence: evidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: unreachableProjectionReader(),
      observedThrough,
      historicalGitHubOmission: {
        reason: "No timestamp-valid GitHub snapshot exists for this day.",
        authorizedAt: observedThrough,
        readerQuality: "limited_sources",
      },
    });

    expect(decision.publicationDecision).toMatchObject({
      status: "rejected",
      reasonCodes: ["github_projection_unavailable"],
    });
  });

  it("rejects a malformed requested-day row instead of omitting it", async () => {
    const [completeItem] = githubProjectionInput({
      observedAt: new Date("2026-07-11T00:05:00.000Z"),
    });
    const partialItem = { ...completeItem! };
    delete partialItem.rank;
    const decision = await evaluateReaderSummaryPrepublication({
      artifact: artifactWithoutGitHubBoard(),
      evidence: evidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: {
        async read() {
          return {
            eligibleBindingIds: ["github-binding-a"],
            items: [partialItem],
            pageCount: 2,
          };
        },
      },
      observedThrough,
      historicalGitHubOmission: {
        reason: "No timestamp-valid GitHub snapshot exists for this day.",
        authorizedAt: observedThrough,
        readerQuality: "limited_sources",
      },
    });

    expect(decision.publicationDecision.status).toBe("rejected");
    expect(decision.githubProjectionAudit.violationCodes).toContain(
      "github_projection_identity_invalid",
    );
    expect(decision.githubProjectionAudit).not.toHaveProperty(
      "historicalOmission",
    );
  });

  it.each([0, 1.5, Number.NaN])(
    "rejects omission when canonical pageCount is invalid: %s",
    async (pageCount) => {
      const decision = await evaluateReaderSummaryPrepublication({
        artifact: artifactWithoutGitHubBoard(),
        evidence: evidenceSelection,
        publicationPolicy: publishingPolicy(),
        githubProjectionReader: {
          async read() {
            return { eligibleBindingIds: [], items: [], pageCount };
          },
        },
        observedThrough,
        historicalGitHubOmission: {
          reason: "No timestamp-valid GitHub snapshot exists for this day.",
          authorizedAt: observedThrough,
          readerQuality: "limited_sources",
        },
      });

      expect(decision.publicationDecision).toMatchObject({
        status: "rejected",
        reasonCodes: expect.arrayContaining(["github_projection_unavailable"]),
      });
      expect(decision.githubProjectionAudit).not.toHaveProperty(
        "historicalOmission",
      );
    },
  );

  it.each([
    [
      new Date("2026-07-10T23:59:59.999Z"),
      "No timestamp-valid GitHub snapshot exists for this day.",
    ],
    [
      new Date("2026-07-11T02:00:00.000Z"),
      "No timestamp-valid GitHub snapshot exists for this day.",
    ],
    [
      new Date("2026-07-11T01:00:00.000Z"),
      [
        "authorization:",
        ["Bear", "er"].join(""),
        "placeholder",
      ].join(" "),
    ],
  ])(
    "rejects unsafe or out-of-bounds omission authorization: %s",
    async (authorizedAt, reason) => {
      const decision = await evaluateReaderSummaryPrepublication({
        artifact: artifactWithoutGitHubBoard(),
        evidence: evidenceSelection,
        publicationPolicy: publishingPolicy(),
        githubProjectionReader: unreachableProjectionReader(),
        observedThrough,
        historicalGitHubOmission: {
          reason,
          authorizedAt,
          readerQuality: "limited_sources",
        },
      });

      expect(decision.publicationDecision.status).toBe("rejected");
    },
  );

  it("rejects omission for the UTC day still in progress", async () => {
    const decision = await evaluateReaderSummaryPrepublication({
      artifact: artifactWithoutGitHubBoard({
        cadence: "daily",
        startedAt: new Date("2026-07-11T00:00:00.000Z"),
        endedAt: new Date("2026-07-12T00:00:00.000Z"),
        periodKey: "daily:2026-07-11T00:00:00.000Z:2026-07-12T00:00:00.000Z:UTC",
      }),
      evidence: evidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: unreachableProjectionReader(),
      observedThrough,
      historicalGitHubOmission: {
        reason: "No timestamp-valid GitHub snapshot exists for this day.",
        authorizedAt: observedThrough,
        readerQuality: "limited_sources",
      },
    });

    expect(decision.publicationDecision.status).toBe("rejected");
  });

  it("fails closed without falling through to the ordinary projection reader when V4 provenance rejects", async () => {
    let readCount = 0;
    const recoveryProvenance: ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort = {
      recoveryVersion: "reader_summary.daily_canonical_recovery.v4",
      selectedOutputKind: "output_text",
      sourceAuthoritySchemaVersion: 2,
      tenantId: tenant,
      workspaceId: workspace,
      requestedUtcDate: "2026-07-10",
      ingestionCutoff: observedThrough.toISOString(),
      sourceAuthoritySha256: "a".repeat(64),
      modelJobIdentity: "b".repeat(64),
      canonicalOutputSha256: "c".repeat(64),
      canonicalOutputByteLength: 1,
      rawOutputSha256: "e".repeat(64),
      rawOutputByteLength: 1,
      githubProjectionSha256: "d".repeat(64),
      verifyPrepublication: () => {
        throw new Error("recovery provenance binding diverged");
      },
    };
    const decision = await evaluateReaderSummaryPrepublication({
      artifact: artifactWithoutGitHubBoard(),
      evidence: evidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: {
        async read() {
          readCount += 1;
          throw new Error("ordinary projection reader must stay unreachable");
        },
      },
      observedThrough,
      recoveryProvenance,
    });

    expect(readCount).toBe(0);
    expect(decision.publicationDecision).toMatchObject({
      status: "rejected",
      reasonCodes: ["github_projection_unavailable"],
    });
    expect(decision.githubProjectionAudit.status).toBe("rejected");
  });

  it("rejects a structurally forged ordinary audit from a claimed V4 provenance port", async () => {
    const recoveryProvenance: ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort = {
      recoveryVersion: "reader_summary.daily_canonical_recovery.v4",
      selectedOutputKind: "output_text",
      sourceAuthoritySchemaVersion: 2,
      tenantId: tenant,
      workspaceId: workspace,
      requestedUtcDate: "2026-07-10",
      ingestionCutoff: observedThrough.toISOString(),
      sourceAuthoritySha256: "a".repeat(64),
      modelJobIdentity: "b".repeat(64),
      canonicalOutputSha256: "c".repeat(64),
      canonicalOutputByteLength: 1,
      rawOutputSha256: "e".repeat(64),
      rawOutputByteLength: 1,
      githubProjectionSha256: "d".repeat(64),
      verifyPrepublication: () => ({
        audit: {
          schemaVersion: "reader_summary.github_projection.v1",
          status: "verified",
          requestedUtcDay: "2026-07-10",
          pageCount: 1,
          scannedItemCount: 0,
          eligibleBindingIds: [],
          bindings: [],
          violationCodes: [],
          reasons: [],
        },
        findings: [],
      }),
    };

    const decision = await evaluateReaderSummaryPrepublication({
      artifact: artifactWithoutGitHubBoard(),
      evidence: evidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: {
        async read() {
          throw new Error("ordinary projection reader must stay unreachable");
        },
      },
      observedThrough,
      recoveryProvenance,
    });

    expect(decision.publicationDecision).toMatchObject({
      status: "rejected",
      reasonCodes: ["github_projection_unavailable"],
    });
  });

  it("accepts matching V4 recovery provenance without querying the ordinary reader", async () => {
    let readCount = 0;
    const recoveryV4 = matchingRecoveryV4();
    const decision = await evaluateReaderSummaryPrepublication({
      artifact: artifactWithoutGitHubBoard(),
      evidence: evidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: {
        async read() {
          readCount += 1;
          throw new Error("ordinary projection reader must stay unreachable");
        },
      },
      observedThrough,
      recoveryProvenance: recoveryProvenanceFor(dailyRecoveryAudit(recoveryV4)),
    });

    expect(readCount).toBe(0);
    expect(decision.publicationDecision.status).toBe("published");
    expect(decision.githubProjectionAudit).toMatchObject({ recoveryV4 });
  });

  it("keeps matching 13-field V2 recovery provenance publishable", async () => {
    let readCount = 0;
    const recoveryV4 = matchingRecoveryV2();
    const decision = await evaluateReaderSummaryPrepublication({
      artifact: artifactWithoutGitHubBoard(),
      evidence: evidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: {
        async read() {
          readCount += 1;
          throw new Error("ordinary projection reader must stay unreachable");
        },
      },
      observedThrough,
      recoveryProvenance: recoveryProvenanceV2For(dailyRecoveryAudit(recoveryV4)),
    });

    expect(readCount).toBe(0);
    expect(decision.publicationDecision.status).toBe("published");
    expect(decision.githubProjectionAudit).toMatchObject({ recoveryV4 });
  });

  it("fails closed when one V4 recovery provenance field diverges", async () => {
    const recoveryV4 = {
      ...matchingRecoveryV4(),
      canonicalOutputByteLength: 2,
    };
    const decision = await evaluateReaderSummaryPrepublication({
      artifact: artifactWithoutGitHubBoard(),
      evidence: evidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: unreachableProjectionReader(),
      observedThrough,
      recoveryProvenance: recoveryProvenanceFor(dailyRecoveryAudit(recoveryV4)),
    });

    expect(decision.publicationDecision).toMatchObject({
      status: "rejected",
      reasonCodes: ["github_projection_unavailable"],
    });
  });

  it("fails closed when a required V4 recovery provenance field is inherited", async () => {
    const { githubProjectionSha256, ...ownFields } = matchingRecoveryV4();
    const recoveryV4 = Object.assign(
      Object.create({ githubProjectionSha256 }),
      { ...ownFields, unexpected: true },
    );
    const decision = await evaluateReaderSummaryPrepublication({
      artifact: artifactWithoutGitHubBoard(),
      evidence: evidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: unreachableProjectionReader(),
      observedThrough,
      recoveryProvenance: recoveryProvenanceFor(dailyRecoveryAudit(recoveryV4)),
    });

    expect(decision.publicationDecision).toMatchObject({
      status: "rejected",
      reasonCodes: ["github_projection_unavailable"],
    });
  });

  it("fails closed when V4 recovery provenance is an array", async () => {
    const recoveryV4 = Object.assign([], matchingRecoveryV4());
    const decision = await evaluateReaderSummaryPrepublication({
      artifact: artifactWithoutGitHubBoard(),
      evidence: evidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: unreachableProjectionReader(),
      observedThrough,
      recoveryProvenance: recoveryProvenanceFor(dailyRecoveryAudit(recoveryV4)),
    });

    expect(decision.publicationDecision).toMatchObject({
      status: "rejected",
      reasonCodes: ["github_projection_unavailable"],
    });
  });

  it("rejects a partial GitHub selectedPosts board before persistence", async () => {
    const decision = await evaluateReaderSummaryPrepublication({
      artifact: githubArtifact(5),
      evidence: evidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: {
        async read() {
          return {
            eligibleBindingIds: ["github-binding-a"],
            items: projectionItems(),
            pageCount: 2,
          };
        },
      },
      observedThrough,
    });

    expect(decision.publicationDecision).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["github_projection_missing"]),
    });
  });

  it("keeps a non-daily non-GitHub summary publishable without querying a daily board", async () => {
    let readCount = 0;
    const period = {
      cadence: "weekly",
      startedAt: new Date("2026-07-06T00:00:00.000Z"),
      endedAt: new Date("2026-07-13T00:00:00.000Z"),
      periodKey: buildReaderSummaryPeriod({
        cadence: "weekly",
        startedAt: new Date("2026-07-06T00:00:00.000Z"),
        endedAt: new Date("2026-07-13T00:00:00.000Z"),
        timezone: "UTC",
      }).periodKey,
    } as const;
    const artifact = artifactWithoutGitHubBoard(period);

    const decision = await evaluateReaderSummaryPrepublication({
      artifact,
      evidence: evidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: {
        async read() {
          readCount += 1;
          throw new Error("daily board must not be queried");
        },
      },
      observedThrough,
    });

    expect(readCount).toBe(0);
    expect(decision.publicationDecision.status).toBe("published");
    expect(decision.githubProjectionAudit.status).toBe("not_applicable");
  });
});

const publishingPolicy = (): ReaderSummaryPublicationPolicy =>
  ({
    evaluate(): ReaderSummaryPublicationDecision {
      return {
        status: "published",
        qualityPassed: true,
        canonicalScore: 1,
        shadow: {
          mode: "shadow",
          policyVersion: "reader_summary_publication_shadow_v1",
          riskScore: 0,
          signals: [],
        },
        reasons: [],
      };
    },
  });

const githubArtifact = (selectedPostCount = 10): ReaderSummaryArtifact =>
  githubBoardArtifact({ selectedPostCount });

const artifactWithoutGitHubBoard = (
  period: {
    readonly cadence: "daily" | "weekly";
    readonly startedAt: Date;
    readonly endedAt: Date;
    readonly periodKey: string;
  } = {
    cadence: "daily",
    startedAt: dayStartedAt,
    endedAt: dayEndedAt,
    periodKey: buildReaderSummaryPeriod({
      cadence: "daily",
      startedAt: dayStartedAt,
      endedAt: dayEndedAt,
      timezone: "UTC",
    }).periodKey,
  },
): ReaderSummaryArtifact =>
  completedRssArtifact(period);

const ordinaryNoSignalArtifact = (): ReaderSummaryArtifact =>
  ReaderSummaryArtifact.create({
    ...baseArtifactProps("ordinary-no-signal"),
    headline: "No reliable signal",
    executiveSummary: "No eligible provider evidence.",
    topStories: [],
    citationMap: [],
    qualityFlags: ["no_signal"],
    confidence: {
      level: "none",
      score: 0,
      rationale: "No provider evidence passed the quality threshold.",
    },
    noSignalReason: "No eligible provider evidence.",
  });

const projectionItems = () =>
  githubProjectionInput();

const matchingRecoveryV4 = () => ({
  schemaVersion: "reader_summary.daily_canonical_recovery_provenance.v3",
  recoveryVersion: "reader_summary.daily_canonical_recovery.v4",
  selectedOutputKind: "output_text",
  sourceAuthoritySchemaVersion: 2,
  tenantId: tenant,
  workspaceId: workspace,
  requestedUtcDate: "2026-07-10",
  ingestionCutoff: observedThrough.toISOString(),
  sourceAuthoritySha256: "a".repeat(64),
  modelJobIdentity: "b".repeat(64),
  canonicalOutputSha256: "c".repeat(64),
  canonicalOutputByteLength: 1,
  rawOutputSha256: "e".repeat(64),
  rawOutputByteLength: 1,
  githubProjectionSha256: "d".repeat(64),
});

const matchingRecoveryV2 = () => ({
  schemaVersion: "reader_summary.daily_canonical_recovery_provenance.v2",
  recoveryVersion: "reader_summary.daily_canonical_recovery.v4",
  selectedOutputKind: "output_text",
  sourceAuthoritySchemaVersion: 2 as const,
  tenantId: tenant,
  workspaceId: workspace,
  requestedUtcDate: "2026-07-10",
  ingestionCutoff: observedThrough.toISOString(),
  sourceAuthoritySha256: "a".repeat(64),
  modelJobIdentity: "b".repeat(64),
  outputTextSha256: "c".repeat(64),
  outputTextByteLength: 1,
  githubProjectionSha256: "d".repeat(64),
});

const dailyRecoveryAudit = (recoveryV4: unknown) =>
  ({
    schemaVersion: "reader_summary.github_projection.v1",
    status: "verified",
    requestedUtcDay: "2026-07-10",
    pageCount: 1,
    scannedItemCount: 0,
    eligibleBindingIds: [],
    bindings: [],
    violationCodes: [],
    reasons: [],
    recoveryV4,
  }) as unknown as ReturnType<
    ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort["verifyPrepublication"]
  >["audit"];

const recoveryProvenanceFor = (
  audit: ReturnType<
    ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort["verifyPrepublication"]
  >["audit"],
): ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort => ({
  recoveryVersion: "reader_summary.daily_canonical_recovery.v4",
  selectedOutputKind: "output_text",
  sourceAuthoritySchemaVersion: 2,
  tenantId: tenant,
  workspaceId: workspace,
  requestedUtcDate: "2026-07-10",
  ingestionCutoff: observedThrough.toISOString(),
  sourceAuthoritySha256: "a".repeat(64),
  modelJobIdentity: "b".repeat(64),
  canonicalOutputSha256: "c".repeat(64),
  canonicalOutputByteLength: 1,
  rawOutputSha256: "e".repeat(64),
  rawOutputByteLength: 1,
  githubProjectionSha256: "d".repeat(64),
  verifyPrepublication: () => ({ audit, findings: [] }),
});

const recoveryProvenanceV2For = (
  audit: ReturnType<
    ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort["verifyPrepublication"]
  >["audit"],
): ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort => ({
  recoveryVersion: "reader_summary.daily_canonical_recovery.v4",
  selectedOutputKind: "output_text",
  sourceAuthoritySchemaVersion: 2,
  tenantId: tenant,
  workspaceId: workspace,
  requestedUtcDate: "2026-07-10",
  ingestionCutoff: observedThrough.toISOString(),
  sourceAuthoritySha256: "a".repeat(64),
  modelJobIdentity: "b".repeat(64),
  outputTextSha256: "c".repeat(64),
  outputTextByteLength: 1,
  githubProjectionSha256: "d".repeat(64),
  verifyPrepublication: () => ({ audit, findings: [] }),
});

const unreachableProjectionReader = (): ReaderSummaryGitHubProjectionReaderPort => ({
  async read() {
    throw new Error("ordinary projection reader must stay unreachable");
  },
});

const completedRssArtifact = (
  periodInput: {
    readonly cadence: "daily" | "weekly";
    readonly startedAt: Date;
    readonly endedAt: Date;
    readonly periodKey: string;
  },
): ReaderSummaryArtifact => {
  const citation = {
    citationId: "rss-citation",
    feedItemId: "rss-feed",
    sourceItemId: "rss-source",
    providerKey: "rss",
    field: "title" as const,
    canonicalUrl: "https://example.test/rss-story",
  };
  return ReaderSummaryArtifact.create({
    ...baseArtifactProps("completed-rss", periodInput),
    headline: "An RSS source produced one reliable signal",
    executiveSummary: "One DB-backed RSS item passed publication quality.",
    storyClusters: [
      {
        id: "rss-cluster",
        storyKey: "rss-story",
        representativeFeedItemId: citation.feedItemId,
        duplicateFeedItemIds: [],
        interestIds: ["rss-interest"],
        providerKeys: ["rss"],
        score: 1,
        observedAtRange: {
          startedAt: periodInput.startedAt,
          endedAt: periodInput.endedAt,
        },
        whyImportant: ["The source is DB-backed."],
      },
    ],
    sourceWindow: {
      windowId: "completed-rss-window",
      startedAt: periodInput.startedAt,
      endedAt: periodInput.endedAt,
      selectedFeedItemIds: [citation.feedItemId],
      storyClusterIds: ["rss-cluster"],
    },
    topStories: [
      {
        storyClusterId: "rss-cluster",
        title: "RSS story",
        summary: "One durable RSS story.",
        interestIds: ["rss-interest"],
        providerKeys: ["rss"],
        citationIds: [citation.citationId],
      },
    ],
    citationMap: [citation],
  });
};

const baseArtifactProps = (
  suffix: string,
  periodInput: {
    readonly cadence: "daily" | "weekly";
    readonly startedAt: Date;
    readonly endedAt: Date;
    readonly periodKey: string;
  } = {
    cadence: "daily",
    startedAt: dayStartedAt,
    endedAt: dayEndedAt,
    periodKey: buildReaderSummaryPeriod({
      cadence: "daily",
      startedAt: dayStartedAt,
      endedAt: dayEndedAt,
      timezone: "UTC",
    }).periodKey,
  },
) => ({
  schemaVersion: "reader_summary.artifact.v1" as const,
  readerSummaryId: `reader-summary-${suffix}`,
  tenantId: tenant,
  workspaceId: workspace,
  scope: { type: "workspace" as const },
  period: { ...periodInput, timezone: "UTC" },
  generatedAt: new Date("2026-07-10T23:00:00.000Z"),
  sourceWindow: {
    windowId: `${suffix}-window`,
    startedAt: periodInput.startedAt,
    endedAt: periodInput.endedAt,
    selectedFeedItemIds: [],
    storyClusterIds: [],
  },
  storyClusters: [],
  contextArtifacts: [],
  headline: "Reader summary fixture",
  executiveSummary: "Reader summary fixture.",
  topStories: [],
  interestHighlights: [],
  repeatedSignals: [],
  risksAndUnknowns: [],
  citationMap: [],
  qualityFlags: [] as const,
  confidence: {
    level: "medium" as const,
    score: 0.8,
    rationale: "Fixture evidence is coherent.",
  },
  lineage: {
    promptVersion: "reader-summary.prompt.prepublication.v1",
    schemaVersion: "reader_summary.artifact.v1" as const,
    modelVersion: "codex:gpt-5.5:xhigh",
    providerVersion: "fixture",
    rulesVersion: "reader-summary.rules.v1",
    evalDatasetVersion: "reader-summary.eval.v1",
  },
  usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 },
});

const tenant = tenantId("tenant-github-projection");
const workspace = workspaceId("workspace-github-projection");
const dayStartedAt = new Date("2026-07-10T00:00:00.000Z");
const dayEndedAt = new Date("2026-07-11T00:00:00.000Z");
const observedThrough = new Date("2026-07-11T01:00:00.000Z");

const evidenceSelection: SummaryEvidenceSelection = {
  rankingPolicyVersion: "reader-summary.ranking.v1",
  sourceWindow: {
    windowId: "prepublication-evidence",
    startedAt: dayStartedAt,
    endedAt: dayEndedAt,
    selectedFeedItemIds: [],
    storyClusterIds: [],
  },
  clusters: [],
  selectedEvidence: [],
};
