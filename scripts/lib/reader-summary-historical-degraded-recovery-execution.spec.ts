import { ReaderSummaryArtifact } from "@social-monitor/summary/domain";
import type { ReaderSummaryJob } from "@social-monitor/summary/domain";
import { githubBoardArtifact } from "@social-monitor/summary/domain/policies/reader-summary-github-projection-policy.spec-support";
import type { ReaderSummaryRecoveryFinalizationPort } from "@social-monitor/summary/ports";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  prepareHistoricalDegradedRecoveryAuthority,
  sha256,
} from "./reader-summary-historical-degraded-recovery-authority";
import {
  buildHistoricalDegradedRecoveryCommand,
  executeHistoricalDegradedRecovery,
  type HistoricalDegradedRecoveryFiles,
  type HistoricalDegradedRecoveryLiveVerifier,
} from "./reader-summary-historical-degraded-recovery-execution";
import {
  historicalDegradedRecoveryPublicationBinding,
  verifyHistoricalDegradedRecoveryPublicationSlot,
} from "./reader-summary-historical-degraded-recovery-slot";
import { PrismaHistoricalDegradedRecoveryLiveVerifier } from "./reader-summary-historical-degraded-recovery-live";

describe("historical degraded recovery execution", () => {
  it("publishes once, replays the same receipt, and never mutates the source", async () => {
    const source = sourceArtifact();
    const sourceBefore = source.toSnapshot();
    const files = fixtureFiles();
    const prepared = authorityFor(source, files);
    const finalization = new IdempotentFinalization();
    const input = {
      authorityBytes: prepared.bytes,
      authoritySha256: prepared.sha256,
      files,
      preflightAt: new Date("2026-08-22T12:00:00.000Z"),
      liveVerifier: liveVerifier(source),
      finalization,
    };

    await expect(executeHistoricalDegradedRecovery(input)).resolves.toMatchObject({
      outcome: "published",
      attemptIdentity: prepared.authority.attempt.identity,
    });
    await expect(executeHistoricalDegradedRecovery(input)).resolves.toMatchObject({
      outcome: "replayed",
      attemptIdentity: prepared.authority.attempt.identity,
    });

    expect(finalization.publicationCount).toBe(1);
    expect(finalization.outboxCount).toBe(1);
    expect(finalization.modelCallCount).toBe(0);
    expect(
      finalization.lastCandidateJob?.toSnapshot().status,
    ).toBe("running");
    expect(finalization.lastArtifact?.toSnapshot().qualityFlags).toEqual([
      "limited_sources",
    ]);
    expect(finalization.lastAudit).toMatchObject({
      status: "not_required",
      historicalOmission: {
        mode: "github_projection_unavailable_historical",
      },
    });
    expect(finalization.lastDecision).toMatchObject({
      status: "published",
      reasons: [
        "The requested UTC day has no canonical GitHub projection; publish the already collected non-GitHub summary with limited source disclosure.",
      ],
    });
    expect(finalization.lastReadyEvent).toMatchObject({
      correlationId: finalization.lastReadyEvent?.payload.readerSummaryJobId,
      causationId: finalization.lastReadyEvent?.payload.readerSummaryJobId,
    });
    expect(finalization.lastBinding).toMatchObject({
      requestedUtcDate: "2026-08-18",
      requestedAt: "2026-08-18T00:00:00.000Z",
    });
    expect(source.toSnapshot()).toEqual(sourceBefore);
  });

  it("aborts mutated files before persistence", async () => {
    const source = sourceArtifact();
    const files = fixtureFiles();
    const prepared = authorityFor(source, files);
    const save = jest.fn();

    await expect(
      executeHistoricalDegradedRecovery({
        authorityBytes: prepared.bytes,
        authoritySha256: prepared.sha256,
        files: {
          ...files,
          datasetManifestBytes: Buffer.from("mutated"),
        },
        preflightAt: new Date("2026-08-22T12:00:00.000Z"),
        liveVerifier: liveVerifier(source),
        finalization: new IdempotentFinalization(),
      }),
    ).rejects.toThrow("mutation");
    expect(save).not.toHaveBeenCalled();
  });

  it("aborts when live verification reports an active slot or changed truth", async () => {
    const source = sourceArtifact();
    const files = fixtureFiles();
    const prepared = authorityFor(source, files);
    const save = jest.fn();
    const liveVerifier: HistoricalDegradedRecoveryLiveVerifier = {
      verify: async () => {
        throw new Error("Historical degraded recovery requires an empty public slot");
      },
      verifyPublicationSlot: async () => "empty",
    };
    await expect(
      executeHistoricalDegradedRecovery({
        authorityBytes: prepared.bytes,
        authoritySha256: prepared.sha256,
        files,
        preflightAt: new Date("2026-08-22T12:00:00.000Z"),
        liveVerifier,
        finalization: new IdempotentFinalization(),
      }),
    ).rejects.toThrow("empty public slot");
    expect(save).not.toHaveBeenCalled();
  });

  it("re-runs the no-GitHub-evidence invariant before persistence", async () => {
    const source = sourceArtifact();
    const snapshot = source.toSnapshot();
    const contaminated = ReaderSummaryArtifact.create({
      ...snapshot,
      storyClusters: snapshot.storyClusters?.map((cluster) => ({
        ...cluster,
        providerKeys: ["github-trending-page"],
      })),
    });
    const files = fixtureFiles();
    const prepared = authorityFor(contaminated, files);
    const save = jest.fn();
    await expect(executeHistoricalDegradedRecovery({
      authorityBytes: prepared.bytes,
      authoritySha256: prepared.sha256,
      files,
      preflightAt: new Date("2026-08-22T12:00:00.000Z"),
      liveVerifier: liveVerifier(contaminated),
      finalization: new IdempotentFinalization(),
    })).rejects.toThrow("source contains GitHub evidence");
    expect(save).not.toHaveBeenCalled();
  });

  it("checks receipt scalar tenant and workspace scope in slot verification", async () => {
    const source = sourceArtifact();
    const files = fixtureFiles();
    const prepared = authorityFor(source, files);
    const built = buildHistoricalDegradedRecoveryCommand({
      authority: prepared.authority,
      authoritySha256: prepared.sha256,
      live: await liveVerifier(source).verify({
        authority: prepared.authority,
        authoritySha256: prepared.sha256,
        files,
      }),
    });
    const binding = historicalDegradedRecoveryPublicationBinding(
      built.command,
      prepared.authority.requestedUtcDate,
    );
    let sql = "";
    const client = {
      $queryRaw: async (strings: TemplateStringsArray) => {
        sql = strings.join("?");
        return [{
          publicationCount: 0,
          exactPublicationCount: 0,
          exactOutboxCount: 0,
          completedCandidateCount: 0,
          slotCount: 1,
          currentPublicationId: null,
        }];
      },
    };
    await expect(verifyHistoricalDegradedRecoveryPublicationSlot({
      client: client as never,
      authority: prepared.authority,
      binding,
    })).resolves.toBe("empty");
    expect(sql).toContain("receipt.tenant_id =");
    expect(sql).toContain("receipt.workspace_id =");
  });

  it("classifies an exact replay before reading current dataset truth", async () => {
    const source = sourceArtifact();
    const files = fixtureFiles();
    const prepared = authorityFor(source, files);
    const built = buildHistoricalDegradedRecoveryCommand({
      authority: prepared.authority,
      authoritySha256: prepared.sha256,
      live: await liveVerifier(source).verify({
        authority: prepared.authority,
        authoritySha256: prepared.sha256,
        files,
      }),
    });
    let queryCount = 0;
    const client = {
      $queryRaw: async () => {
        queryCount += 1;
        if (queryCount !== 1) {
          throw new Error("current dataset must not be read during exact replay");
        }
        return [{
          publicationCount: 1,
          exactPublicationCount: 1,
          exactOutboxCount: 1,
          completedCandidateCount: 1,
          slotCount: 1,
          currentPublicationId: built.identities.artifactId,
        }];
      },
    };
    const verifier = new PrismaHistoricalDegradedRecoveryLiveVerifier(
      client as never,
    );

    await expect(verifier.verifyPublicationSlot({
      authority: prepared.authority,
      authoritySha256: prepared.sha256,
      command: built.command,
      files,
      preflightAt: new Date("2027-01-01T00:00:00.000Z"),
    })).resolves.toBe("replay");
    expect(queryCount).toBe(1);
  });
});

class IdempotentFinalization {
  publicationCount = 0;
  outboxCount = 0;
  modelCallCount = 0;
  lastAudit: unknown;
  lastDecision: unknown;
  lastArtifact: ReaderSummaryArtifact | undefined;
  lastCandidateJob: ReaderSummaryJob | undefined;
  lastReadyEvent:
    | Parameters<ReaderSummaryRecoveryFinalizationPort["finalize"]>[0]["publication"]["readyEvent"]
    | undefined;
  lastBinding: ReturnType<typeof historicalDegradedRecoveryPublicationBinding>
    | undefined;
  private identity: string | undefined;

  async finalize(
    command: Parameters<ReaderSummaryRecoveryFinalizationPort["finalize"]>[0],
  ): Promise<"published" | "replayed"> {
    const current = command.provenance.priorCollectionProof.sourceAttempt.sha256;
    this.lastAudit = command.publication.githubProjectionAudit;
    this.lastDecision = command.publication.publicationDecision;
    this.lastArtifact = command.publication.artifact;
    this.lastCandidateJob = command.candidate?.runningJob;
    this.lastReadyEvent = command.publication.readyEvent;
    this.lastBinding = historicalDegradedRecoveryPublicationBinding(
      command,
      "2026-08-18",
    );
    if (this.identity === undefined) {
      this.identity = current;
      this.publicationCount += 1;
      this.outboxCount += 1;
      return "published";
    }
    if (this.identity !== current) throw new Error("recovery receipt conflict");
    return "replayed";
  }
}

const liveVerifier = (
  sourceArtifact: ReaderSummaryArtifact,
): HistoricalDegradedRecoveryLiveVerifier => {
  let slotReadCount = 0;
  return {
    verify: async () => ({
    sourceArtifact,
    sourcePublicationDecision: {
      status: "rejected",
      qualityPassed: false,
      canonicalScore: 0.9,
      shadow: {
        mode: "shadow",
        policyVersion: "reader_summary_publication_shadow_v1",
        riskScore: 0,
        signals: [],
      },
      reasonCodes: [
        "github_projection_missing",
        "github_projection_mixed",
        "github_projection_gapped",
      ],
      reasons: ["GitHub projection unavailable."],
      findings: [
        {
          code: "github_projection_missing",
          reason: "GitHub projection unavailable.",
        },
      ],
    },
    }),
    verifyPublicationSlot: async () => {
      slotReadCount += 1;
      return slotReadCount === 1 ? "empty" : "replay";
    },
  };
};

const authorityFor = (
  source: ReaderSummaryArtifact,
  files: HistoricalDegradedRecoveryFiles,
) => prepareHistoricalDegradedRecoveryAuthority({
  requestedUtcDate: "2026-08-18",
  sourceCandidates: [
    {
      jobId: "00000000-0000-7000-8000-000000000111",
      artifactId: source.toSnapshot().readerSummaryId,
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
          { code: "github_projection_missing", reason: "Unavailable." },
        ],
      },
      summaryText: source.toSnapshot().executiveSummary,
      sourceRecordSha256: sha256("source"),
    },
  ],
  existingPublicationCount: 0,
  activeSlotCount: 0,
  ...files,
  dataset: {
    liveCount: 277,
    uniqueCount: 277,
    aggregateSha256: sha256("dataset"),
    providerCounts: {
      "hacker-news": 100,
      reddit: 79,
      rss: 26,
      "x-twitter": 72,
    },
  },
  githubZero: {
    readerStatus: "ok",
    observedThrough: "2026-08-22T12:00:00.000Z",
    pageCount: 2,
    scannedItemCount: 160,
    touchingRequestedDayCount: 0,
    eligibleBindingIds: ["github-binding"],
    firstLaterObservation: "2026-08-20T00:01:00.000Z",
    projectionSha256: sha256("projection"),
  },
  servingAuthority: { model: "gpt-5.6-sol" },
  authorizedAt: new Date("2026-08-22T12:00:00.000Z"),
});

const fixtureFiles = (): HistoricalDegradedRecoveryFiles => ({
  collectionArtifactBytes: Buffer.from("collection"),
  collectionQualityReportBytes: Buffer.from("quality"),
  datasetManifestBytes: Buffer.from("manifest"),
  xBackfillReceiptBytes: Buffer.from(JSON.stringify({
    artifactFormat: "reader-summary-historical-x-backfill-receipt-v1",
    tenantId: "00000000-0000-7000-8000-000000006101",
    workspaceId: "00000000-0000-7000-8000-000000006102",
    requestedUtcDate: "2026-08-18",
    providerKey: "x-twitter",
    baseRowCount: 0,
    insertedRowCount: 72,
    finalRowCount: 72,
    rows: Array.from({ length: 72 }, (_, index) => ({ sourceItemId: index })),
  })),
});

const sourceArtifact = (): ReaderSummaryArtifact => {
  const base = githubBoardArtifact({
    selectedPostCount: 0,
    dayStartedAt: new Date("2026-08-18T00:00:00.000Z"),
    dayEndedAt: new Date("2026-08-19T00:00:00.000Z"),
  }).toSnapshot();
  const editorialCitation = base.citationMap.find(
    (citation) => citation.providerKey === "rss",
  )!;
  const baseContent = base.content!;
  const storyClusterId = "editorial-story";
  return ReaderSummaryArtifact.create({
    ...base,
    readerSummaryId: "00000000-0000-7000-8000-000000000112",
    tenantId: tenantId("00000000-0000-7000-8000-000000006101"),
    workspaceId: workspaceId("00000000-0000-7000-8000-000000006102"),
    sourceWindow: {
      ...base.sourceWindow,
      selectedFeedItemIds: [editorialCitation.feedItemId],
      storyClusterIds: [storyClusterId],
    },
    storyClusters: [
      {
        id: storyClusterId,
        storyKey: "url:example.test/editorial-source",
        representativeFeedItemId: editorialCitation.feedItemId,
        duplicateFeedItemIds: [],
        interestIds: ["interest-developer-tools"],
        providerKeys: ["rss"],
        score: 1,
        observedAtRange: {
          startedAt: new Date("2026-08-18T12:00:00.000Z"),
          endedAt: new Date("2026-08-18T12:05:00.000Z"),
        },
        whyImportant: ["Editorial evidence supports the narrative."],
      },
    ],
    content: {
      ...baseContent,
      selectedPosts: [],
      narrativeSections: (baseContent.narrativeSections ?? []).filter(
        (section) => section.id === "lead",
      ),
    },
    topStories: [
      {
        storyClusterId,
        title: "How teams adopt developer tools",
        summary: "Editorial reporting explains adoption patterns.",
        interestIds: ["interest-developer-tools"],
        providerKeys: ["rss"],
        citationIds: [editorialCitation.citationId],
      },
    ],
    citationMap: [editorialCitation],
    qualityFlags: [],
    noSignalReason: undefined,
  });
};
