import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  githubTrendingWatchText,
  ReaderSummaryArtifact,
  type ReaderSummaryGitHubProjectionAudit,
} from "../../../domain";
import type { ReaderSummaryWeeklyEditorialQualityResult } from "../../../domain/policies/reader-summary-weekly-editorial-quality-policy";
import type { ReaderSummaryWeeklyPublicationAuthorization } from "../../../domain/policies/reader-summary-weekly-publication-authorization";
import * as weeklyAuthorizationPolicy from "../../../domain/policies/reader-summary-weekly-publication-authorization";
import {
  type ReaderSummaryDailyCanonicalRecoveryV4Audit,
  type ReaderSummaryDailyCanonicalRecoveryV4BindingV2,
  type ReaderSummaryDailyCanonicalRecoveryV4BindingV3,
} from "../../../ports";
import { PrismaReaderSummaryArtifactRepository } from "./prisma-reader-summary-artifact.repository";
import { FakeReaderSummaryPrisma } from "./prisma-reader-summary-artifact.repository.spec-support";
import {
  readerSummaryArtifact,
  topRead,
} from "./prisma-reader-summary-artifact-fixture.spec-support";

describe("PrismaReaderSummaryArtifactRepository", () => {
  it("skips an incompatible legacy artifact without breaking cursor pagination", async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);
    const ids = [
      "reader-summary-oldest",
      "reader-summary-newest",
      "reader-summary-incompatible",
    ] as const;
    for (const id of ids) {
      await repository.save(
        readerSummaryArtifact(id),
        noEligibleGitHubBindingOptions(),
      );
      prisma.publish(id);
    }
    prisma.replaceArtifactPayload("reader-summary-incompatible", {
      schemaVersion: "reader_summary.artifact.legacy",
    });

    const firstPage = await repository.list({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 1,
    });
    const secondPage = await repository.list({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 1,
      cursor: firstPage.nextCursor,
    });

    expect(firstPage.items.map((item) => item.toSnapshot().readerSummaryId))
      .toEqual(["reader-summary-newest"]);
    expect(firstPage.nextCursor).toBeDefined();
    expect(secondPage.items.map((item) => item.toSnapshot().readerSummaryId))
      .toEqual(["reader-summary-oldest"]);
    expect(secondPage.nextCursor).toBeUndefined();
  });

  it("rejects a daily completed candidate without canonical GitHub proof but stages a genuine no-signal candidate", async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);

    await repository.save(
      readerSummaryArtifact("reader-summary-completed"),
      noEligibleGitHubBindingOptions(),
    );
    await repository.save(
      noSignalReaderSummaryArtifact("reader-summary-empty"),
      noEligibleGitHubBindingOptions(),
    );

    const list = await repository.list({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      cadence: "daily",
      periodStartedAt: period.startedAt,
      periodEndedAt: period.endedAt,
      timezone: period.timezone,
      limit: 10,
    });
    const periods = await repository.listPeriodSummaries({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      cadence: "daily",
      periodStartedAt: period.startedAt,
      periodEndedAt: period.endedAt,
      timezone: period.timezone,
      limit: 10,
    });

    expect(list.items).toEqual([]);
    expect(periods.items).toEqual([]);
    expect(prisma.statusFor("reader-summary-completed")).toBe("REJECTED");
    expect(prisma.statusFor("reader-summary-empty")).toBe("RUNNING");
    await expect(
      repository.findById({
        tenantId: tenant,
        workspaceId: workspace,
        readerSummaryId: "reader-summary-completed",
      }),
    ).resolves.toBeNull();
  });

  it("persists failed-quality evidence as rejected without publishing it", async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);
    await repository.save(readerSummaryArtifact("reader-summary-rejected"), {
      publicationDecision: rejectedDecision,
    });

    expect(prisma.statusFor("reader-summary-rejected")).toBe("REJECTED");
    await expect(
      repository.findById({
        tenantId: tenant,
        workspaceId: workspace,
        readerSummaryId: "reader-summary-rejected",
      }),
    ).resolves.toBeNull();
    await expect(
      repository.findRejectedDebugById({
        tenantId: tenant,
        workspaceId: workspace,
        readerSummaryId: "reader-summary-rejected",
      }),
    ).resolves.toMatchObject({ reasonCodes: ["editorial_quality"] });
  });

  it("rejects GitHub selectedPosts without an exact verified audit", async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);

    await repository.save(
      githubReaderSummaryArtifact("reader-summary-unverified-github"),
      {
        githubProjectionAudit: {
          schemaVersion: "reader_summary.github_projection.v1",
          status: "verified",
          requestedUtcDay: "2026-07-05",
          pageCount: 1,
          scannedItemCount: 1,
          eligibleBindingIds: ["github-binding"],
          bindings: [],
          violationCodes: [],
          reasons: [],
        },
      },
    );

    expect(prisma.statusFor("reader-summary-unverified-github")).toBe(
      "REJECTED",
    );
  });

  it("stages V4 recovery only after PostgreSQL re-verifies its strict provenance", async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);
    const binding: ReaderSummaryDailyCanonicalRecoveryV4BindingV3 = {
      schemaVersion: "reader_summary.daily_canonical_recovery_provenance.v3",
      recoveryVersion: "reader_summary.daily_canonical_recovery.v4",
      selectedOutputKind: "output_text",
      sourceAuthoritySchemaVersion: 2,
      tenantId: tenant,
      workspaceId: workspace,
      requestedUtcDate: "2026-07-24",
      ingestionCutoff: "2026-07-25T00:00:00.000Z",
      sourceAuthoritySha256: "a".repeat(64),
      modelJobIdentity: "b".repeat(64),
      canonicalOutputSha256: "c".repeat(64),
      canonicalOutputByteLength: 17,
      rawOutputSha256: "e".repeat(64),
      rawOutputByteLength: 17,
      githubProjectionSha256: "d".repeat(64),
    };
    const audit = (): ReaderSummaryDailyCanonicalRecoveryV4Audit => ({
      schemaVersion: "reader_summary.github_projection.v1",
      status: "verified",
      requestedUtcDay: binding.requestedUtcDate,
      pageCount: 1,
      scannedItemCount: 0,
      eligibleBindingIds: [],
      observedThrough: binding.ingestionCutoff,
      bindings: [],
      violationCodes: [],
      reasons: [],
      recoveryV4: binding,
    });
    await expect(repository.save(
      recoveryReaderSummaryArtifact("reader-summary-forged-ordinary-audit"),
      { githubProjectionAudit: noEligibleGitHubBindingOptions().githubProjectionAudit },
    )).rejects.toThrow(/not re-verified/u);
    await expect(repository.save(
      recoveryReaderSummaryArtifact("reader-summary-unverified-v4-recovery"),
      { githubProjectionAudit: audit() },
    )).rejects.toThrow(/not re-verified/u);
    prisma.setDailyRecoveryVerification(true);
    await repository.save(
      recoveryReaderSummaryArtifact("reader-summary-verified-v4-recovery"),
      { githubProjectionAudit: audit() },
    );
    const malformedAudit: ReaderSummaryDailyCanonicalRecoveryV4Audit = {
      ...audit(),
      recoveryV4: {
        ...binding,
        rawOutputSha256: "e".repeat(63),
      },
    };
    await expect(repository.save(
      recoveryReaderSummaryArtifact("reader-summary-malformed-v4-recovery"),
      { githubProjectionAudit: malformedAudit },
    )).rejects.toThrow(/provenance binding is invalid/u);

    expect(prisma.statusFor("reader-summary-forged-ordinary-audit")).toBeUndefined();
    expect(prisma.statusFor("reader-summary-unverified-v4-recovery")).toBeUndefined();
    expect(prisma.statusFor("reader-summary-verified-v4-recovery")).toBe(
      "RUNNING",
    );
    expect(prisma.statusFor("reader-summary-malformed-v4-recovery")).toBeUndefined();
    expect(prisma.dailyRecoveryVerificationQueryCount).toBe(3);
  });

  it("preserves the ordinary V2 13-field recovery audit parser", async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);
    const binding: ReaderSummaryDailyCanonicalRecoveryV4BindingV2 = {
      schemaVersion: "reader_summary.daily_canonical_recovery_provenance.v2",
      recoveryVersion: "reader_summary.daily_canonical_recovery.v4",
      selectedOutputKind: "output_text",
      sourceAuthoritySchemaVersion: 2,
      tenantId: tenant,
      workspaceId: workspace,
      requestedUtcDate: "2026-07-24",
      ingestionCutoff: "2026-07-25T00:00:00.000Z",
      sourceAuthoritySha256: "a".repeat(64),
      modelJobIdentity: "b".repeat(64),
      outputTextSha256: "c".repeat(64),
      outputTextByteLength: 17,
      githubProjectionSha256: "d".repeat(64),
    };
    const githubProjectionAudit =
      noEligibleGitHubBindingOptions().githubProjectionAudit;
    if (githubProjectionAudit === undefined) {
      throw new Error("Expected a GitHub projection audit fixture.");
    }
    const recoveryAudit: ReaderSummaryDailyCanonicalRecoveryV4Audit = {
      ...githubProjectionAudit,
      recoveryV4: binding,
    };
    prisma.setDailyRecoveryVerification(true);
    await repository.save(recoveryReaderSummaryArtifact("reader-summary-v2-recovery"), {
      githubProjectionAudit: recoveryAudit,
    });

    expect(prisma.statusFor("reader-summary-v2-recovery")).toBe("RUNNING");
    expect(prisma.dailyRecoveryVerificationQueryCount).toBe(1);
  });

  it("keeps an ordinary existing Jul23-Jul30 artifact idempotent when PostgreSQL has no V4 authority", async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);
    const artifact = recoveryNoSignalReaderSummaryArtifact(
      "reader-summary-ordinary-recovery-window",
    );
    const githubProjectionAudit: ReaderSummaryGitHubProjectionAudit = {
      schemaVersion: "reader_summary.github_projection.v1",
      status: "not_required",
      requestedUtcDay: "2026-07-24",
      pageCount: 1,
      scannedItemCount: 0,
      eligibleBindingIds: [],
      bindings: [],
      violationCodes: [],
      reasons: [],
    };
    prisma.setDailyRecoveryVerification(null);

    await repository.save(artifact, { githubProjectionAudit });
    await expect(repository.save(artifact, { githubProjectionAudit }))
      .resolves.toBeUndefined();

    expect(prisma.statusFor("reader-summary-ordinary-recovery-window")).toBe(
      "RUNNING",
    );
    expect(prisma.dailyRecoveryVerificationQueryCount).toBe(2);
  });

  it("preserves nonempty top reads beside the exact verified GitHub audit", async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);
    const githubProjectionAudit = verifiedGitHubProjectionAudit();

    await repository.save(
      githubReaderSummaryArtifact("reader-summary-verified-github"),
      { githubProjectionAudit },
    );

    expect(prisma.statusFor("reader-summary-verified-github")).toBe("RUNNING");
    expect(
      prisma.qualitySignalsFor("reader-summary-verified-github"),
    ).toMatchObject({ githubProjectionAudit });
    expect(
      githubProjectionAudit.bindings.map((binding) => binding.rank),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(
      new Set(
        githubProjectionAudit.bindings.map((binding) => binding.scanJobId),
      ),
    ).toEqual(new Set(["scan-github-reader-summary-prisma"]));
    expect(
      githubProjectionAudit.bindings.every(
        (binding) =>
          binding.fetchStartedAt <= binding.checkedAt &&
          binding.publishedAt === binding.checkedAt &&
          binding.checkedAt <= binding.observedAt,
      ),
    ).toBe(true);
    prisma.publish("reader-summary-verified-github");
    const restored = await repository.findById({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryId: "reader-summary-verified-github",
    });
    expect(restored?.toSnapshot().content).toMatchObject({
      topReads: [
        expect.objectContaining({
          storyClusterId: "story-1",
          cardKind: "curated_top_read",
        }),
      ],
      selectedPosts: expect.arrayContaining([
        expect.objectContaining({
          storyClusterId:
            "supplemental:github-trending-page:github-feed-1",
          cardKind: "supplemental_trend",
        }),
      ]),
    });
  });

  it("rejects a candidate without durable zero-binding proof", async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);

    await repository.save(
      readerSummaryArtifact("reader-summary-missing-binding-proof"),
    );

    expect(prisma.statusFor("reader-summary-missing-binding-proof")).toBe(
      "REJECTED",
    );
  });

  it("persists discriminated weekly quality and proof and accepts exact replay", async () => {
    const authorization =
      Object.freeze({}) as ReaderSummaryWeeklyPublicationAuthorization;
    const authorizationDetails = weeklyAuthorizationDetails();
    const readAuthorization = jest
      .spyOn(
        weeklyAuthorizationPolicy,
        "readReaderSummaryWeeklyPublicationAuthorization",
      )
      .mockReturnValue(authorizationDetails);
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);
    const command = {
      kind: "weekly" as const,
      artifactId: "weekly-artifact-prisma",
      authorization,
    };

    try {
      await repository.saveWeekly(command);

      const persistedPayload = prisma.weeklyRequests[0];
      expect(persistedPayload?.qualitySignals).toEqual({
        ...authorizationDetails.qualitySignals,
        weeklyPublicationProof: authorizationDetails.proof,
      });
      expect(persistedPayload?.artifactPayload).toEqual({
        schemaVersion: "reader_summary.weekly_persisted_artifact.v1",
        output: authorizationDetails.artifact.output,
        publicationProof: authorizationDetails.proof,
      });
      expect(JSON.stringify(persistedPayload?.qualitySignals)).not.toContain(
        "canonicalScore",
      );
      await expect(repository.saveWeekly(command)).resolves.toBeUndefined();
      expect(prisma.weeklyOutcomes).toEqual(["persisted", "replayed"]);
      expect(prisma.weeklyRequests).toEqual([
        persistedPayload,
        persistedPayload,
      ]);
    } finally {
      readAuthorization.mockRestore();
    }
  });
});

const weeklyAuthorizationDetails = (): ReturnType<
  typeof weeklyAuthorizationPolicy.readReaderSummaryWeeklyPublicationAuthorization
> => {
  const citation = weeklyCitationProof();
  const editorialQuality: ReaderSummaryWeeklyEditorialQualityResult = {
    policyVersion: "reader_summary.weekly_editorial_quality.v2",
    publicationDecision: "allow",
    metrics: {
      leadSectionCount: 1,
      crossDayStoryCount: 0,
      synthesizedCrossDayStoryCount: 0,
      duplicateSameDayStoryObservationCount: 0,
      citedDayCount: 1,
      citedProviderCount: 1,
      dominantDayCitationShare: 1,
      dominantProviderCitationShare: 1,
      dayHeadingCount: 0,
      dailyChronologyMarkerCount: 0,
      singleDaySectionCount: 1,
      unsupportedClaimCount: 0,
      prohibitedEditorialPatternCount: 0,
    },
    qualityGates: {
      exactlyOneLeadSection: true,
      stableStoryIdentityIsUsed: true,
      sameDayStoryObservationsAreUnique: true,
      weeklySynthesisModeIsGrounded: true,
      factualContentIsCited: true,
      citationsSpanMultipleProviders: true,
      citationsSpanAtLeastThreeDays: true,
      providerDominanceIsControlled: true,
      dayDominanceIsControlled: true,
      synthesisCitationsSpanMultipleProviders: true,
      synthesisCitationsSpanAtLeastThreeDays: true,
      synthesisProviderDominanceIsControlled: true,
      synthesisDayDominanceIsControlled: true,
      weeklySynthesisIsCoherent: true,
      readerTextAvoidsProviderInventory: true,
      readerTextAvoidsProcessProse: true,
      claimLanguageIsSupported: true,
    },
    issues: [],
    blockingPassed: true,
  };
  return {
    artifactId: "weekly-artifact-prisma",
    artifact: {
      output: {
        schemaVersion: "reader_summary.weekly_model_output.v1",
        sealId: `reader_summary.weekly_model_input.v1:${"a".repeat(64)}`,
        sealSha: "a".repeat(64),
        weekStartedOn: "2026-07-20",
        weekEndedOn: "2026-07-26",
        headline: "Truthful weekly headline",
        headlineCitationIds: [citation.citationId],
        takeaway: "Truthful weekly takeaway",
        takeawayCitationIds: [citation.citationId],
        synthesis: "Truthful weekly synthesis",
        synthesisCitationIds: [citation.citationId],
        stories: [{
          storyId: "story:weekly-prisma-repository",
          headline: "Certified weekly persistence stays atomic",
          summary:
            "The repository persists one evidence-bound artifact and accepts only its exact replay.",
          status: "developing",
          observedFrom: "2026-07-20",
          observedThrough: "2026-07-20",
          citationIds: [citation.citationId],
        }],
        sections: [{
          sectionId: "section:weekly-prisma-repository-lead",
          storyId: "story:weekly-prisma-repository",
          kind: "lead",
          claimType: "snapshot",
          heading: "Persistence remains evidence-bound",
          text: "The certified artifact retains its immutable citation proof.",
          observedFrom: "2026-07-20",
          observedThrough: "2026-07-20",
          citationIds: [citation.citationId],
        }],
      },
      editorialQuality,
    },
    qualitySignals: {
      kind: "weekly",
      editorialQuality,
    },
    proof: {
      schemaVersion: "reader_summary.weekly_publication_proof.v1",
      artifactId: "weekly-artifact-prisma",
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      weekStartedOn: "2026-07-20",
      weekEndedOn: "2026-07-26",
      manifestSealId:
        `reader_summary.weekly_input_manifest.v1:${"b".repeat(64)}`,
      manifestSealSha256: "b".repeat(64),
      modelInputSealId:
        `reader_summary.weekly_model_input.v1:${"a".repeat(64)}`,
      modelInputSealSha256: "a".repeat(64),
      artifactSha256: "c".repeat(64),
      editorialQualitySha256: "d".repeat(64),
      authorities: weeklyAuthorityProofs(),
      citations: [citation],
      authorizationId:
        `reader_summary.weekly_publication_authorization.v1:${"e".repeat(64)}`,
      sha256: "e".repeat(64),
    },
  };
};

const weeklyCitationProof = () => ({
  citationId: "citation:weekly-prisma-repository-01",
  requestedUtcDate: "2026-07-20",
  publicationId: "weekly-daily-publication-1",
  publicationEvidenceIdentity: "weekly-publication-evidence-1",
  providerKey: "hacker-news" as const,
  feedItemId: "weekly-feed-item-1",
  sourceItemId: "weekly-source-item-1",
  sourceBindingId: "weekly-source-binding-1",
  providerItemId: "weekly-provider-item-1",
  canonicalUrl: "https://example.test/weekly/repository",
  sourceContentHash: "3".repeat(64),
});

const weeklyAuthorityProofs = () =>
  [
    "2026-07-20",
    "2026-07-21",
    "2026-07-22",
    "2026-07-23",
    "2026-07-24",
    "2026-07-25",
    "2026-07-26",
  ].map((requestedUtcDate, index) => ({
    requestedUtcDate,
    publicationId: `weekly-daily-publication-${index + 1}`,
    publicationEvidenceIdentity: `weekly-publication-evidence-${index + 1}`,
    publicationEvidenceSha256: "f".repeat(64),
    storyAuthorityIdentity: `weekly-story-authority-${index + 1}`,
    storyAuthoritySha256: "1".repeat(64),
    githubBoardIdentity: `weekly-github-board-${index + 1}`,
    githubBoardSha256: "2".repeat(64),
  }));

type ReaderSummarySaveOptions = NonNullable<
  Parameters<PrismaReaderSummaryArtifactRepository["save"]>[1]
>;

const noEligibleGitHubBindingOptions = (
  options: Omit<ReaderSummarySaveOptions, "githubProjectionAudit"> = {},
): ReaderSummarySaveOptions => ({
  ...options,
  githubProjectionAudit: {
    schemaVersion: "reader_summary.github_projection.v1",
    status: "not_required",
    requestedUtcDay: "2026-07-05",
    pageCount: 1,
    scannedItemCount: 0,
    eligibleBindingIds: [],
    bindings: [],
    violationCodes: [],
    reasons: [],
  },
});

const rejectedDecision = {
  status: "rejected" as const,
  qualityPassed: false as const,
  canonicalScore: 0,
  shadow: {
    mode: "shadow" as const,
    policyVersion: "reader_summary_publication_shadow_v1" as const,
    riskScore: 0,
    signals: [],
  },
  reasonCodes: ["editorial_quality" as const],
  reasons: ["Editorial proof failed."],
  findings: [
    {
      code: "editorial_quality" as const,
      reason: "Editorial proof failed.",
    },
  ],
};

const tenant = tenantId("tenant-reader-summary-prisma");
const workspace = workspaceId("workspace-reader-summary-prisma");
const period = {
  cadence: "daily" as const,
  startedAt: new Date("2026-07-05T00:00:00.000Z"),
  endedAt: new Date("2026-07-06T00:00:00.000Z"),
  timezone: "UTC",
  periodKey: "daily:2026-07-05T00:00:00.000Z:2026-07-06T00:00:00.000Z:UTC",
};

const recoveryReaderSummaryArtifact = (
  readerSummaryId: string,
): ReaderSummaryArtifact => {
  const snapshot = readerSummaryArtifact(readerSummaryId).toSnapshot();
  const startedAt = new Date("2026-07-24T00:00:00.000Z");
  const endedAt = new Date("2026-07-25T00:00:00.000Z");
  return ReaderSummaryArtifact.create({
    ...snapshot,
    period: {
      cadence: "daily",
      startedAt,
      endedAt,
      timezone: "UTC",
      periodKey: "daily:2026-07-24T00:00:00.000Z:2026-07-25T00:00:00.000Z:UTC",
    },
    sourceWindow: {
      ...snapshot.sourceWindow,
      startedAt,
      endedAt,
    },
  });
};

const noSignalReaderSummaryArtifact = (
  readerSummaryId: string,
): ReaderSummaryArtifact => {
  const snapshot = readerSummaryArtifact(readerSummaryId).toSnapshot();

  return ReaderSummaryArtifact.create({
    ...snapshot,
    sourceWindow: {
      ...snapshot.sourceWindow,
      selectedFeedItemIds: [],
      storyClusterIds: [],
    },
    storyClusters: [],
    headline: "No reliable reader signal",
    executiveSummary: "No eligible evidence items were selected.",
    content: {
      ...snapshot.content!,
      headline: "No reliable reader signal",
      oneLineTakeaway: "No eligible evidence items were selected.",
      bullets: [],
      mainTopics: [],
      qualityState: {
        status: "no_signal",
        flags: ["no_signal", "limited_sources"],
        warnings: ["No eligible evidence items were selected."],
        isSingleSource: true,
      },
      sourceMix: [],
      topReads: [],
      selectedPosts: [],
      claimBoard: [],
      risks: [],
      openQuestions: [],
      nextActions: [],
    },
    topStories: [],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: [],
    qualityFlags: ["no_signal", "limited_sources"],
    confidence: {
      level: "none",
      score: 0,
      rationale: "No eligible evidence items were selected.",
    },
    noSignalReason: "No eligible evidence items were selected.",
  });
};

const recoveryNoSignalReaderSummaryArtifact = (
  readerSummaryId: string,
): ReaderSummaryArtifact => {
  const snapshot = noSignalReaderSummaryArtifact(readerSummaryId).toSnapshot();
  const startedAt = new Date("2026-07-24T00:00:00.000Z");
  const endedAt = new Date("2026-07-25T00:00:00.000Z");
  return ReaderSummaryArtifact.create({
    ...snapshot,
    period: {
      cadence: "daily",
      startedAt,
      endedAt,
      timezone: "UTC",
      periodKey: "daily:2026-07-24T00:00:00.000Z:2026-07-25T00:00:00.000Z:UTC",
    },
    sourceWindow: {
      ...snapshot.sourceWindow,
      startedAt,
      endedAt,
    },
  });
};

const githubReaderSummaryArtifact = (
  readerSummaryId: string,
): ReaderSummaryArtifact => {
  const snapshot = readerSummaryArtifact(readerSummaryId).toSnapshot();
  const githubSelectedPosts = Array.from({ length: 10 }, (_, index) => {
    const rank = index + 1;
    return {
      ...topRead(),
      storyClusterId: `supplemental:github-trending-page:github-feed-${rank}`,
      cardKind: "supplemental_trend" as const,
      title: `owner/repository-${rank}`,
      providerKey: "github-trending-page",
      providerName: "GitHub Trending",
      primaryActionKind: "watch_repository" as const,
      confirmedProviderKeys: ["github-trending-page"],
      providerMetrics: [
        {
          label: "GitHub Trending today",
          value: `#${rank}, +${githubStarsGained(rank)} stars today`,
        },
      ],
      canonicalUrl: `https://github.com/owner/repository-${rank}`,
      citationIds: [`github-citation-${rank}`],
    };
  });

  return ReaderSummaryArtifact.create({
    ...snapshot,
    sourceWindow: {
      ...snapshot.sourceWindow,
      selectedFeedItemIds: [
        "feed-1",
        ...Array.from(
          { length: 10 },
          (_, index) => `github-feed-${index + 1}`,
        ),
      ],
    },
    content: {
      ...snapshot.content!,
      selectedPosts: [...snapshot.content!.topReads, ...githubSelectedPosts],
      narrativeSections: [
        ...(snapshot.content!.narrativeSections ?? []),
        githubTrendingAppendix(),
      ],
    },
    citationMap: [
      ...snapshot.citationMap,
      ...githubSelectedPosts.map((post, index) => ({
        ...snapshot.citationMap[0]!,
        citationId: post.citationIds[0]!,
        feedItemId: `github-feed-${index + 1}`,
        sourceItemId: `github-source-${index + 1}`,
        providerKey: "github-trending-page",
        canonicalUrl: post.canonicalUrl,
      })),
    ],
  });
};

const verifiedGitHubProjectionAudit =
  (): ReaderSummaryGitHubProjectionAudit => ({
    schemaVersion: "reader_summary.github_projection.v1",
    status: "verified",
    requestedUtcDay: "2026-07-05",
    pageCount: 1,
    scannedItemCount: 10,
    eligibleBindingIds: ["github-binding"],
    observedThrough: "2026-07-05T12:05:00.000Z",
    projectionCheckedAt: "2026-07-05T12:00:00.000Z",
    telemetry: {
      github_projection_collection_delay_ms: 0,
      collectionGraceMs: 300_000,
      warningThresholdMs: 240_000,
      qualitySignal: "within_grace",
    },
    bindings: Array.from({ length: 10 }, (_, index) => {
      const rank = index + 1;
      return {
        selectedPostIndex: index,
        rank,
        citationId: `github-citation-${rank}`,
        feedItemId: `github-feed-${rank}`,
        sourceItemId: `github-source-${rank}`,
        sourceBindingId: "github-binding",
        providerKey: "github-trending-page",
        metadataKind: "github_trending_page_repository",
        scanJobId: "scan-github-reader-summary-prisma",
        repositoryIdentity: `owner/repository-${rank}`,
        canonicalUrl: `https://github.com/owner/repository-${rank}`,
        starsGained: githubStarsGained(rank),
        fetchStartedAt: "2026-07-05T12:00:00.000Z",
        publishedAt: "2026-07-05T12:00:00.000Z",
        checkedAt: "2026-07-05T12:00:00.000Z",
        observedAt: "2026-07-05T12:05:00.000Z",
        sourceContentHash: "a".repeat(64),
        sourceProviderContentHash: "b".repeat(64),
      };
    }),
    violationCodes: [],
    reasons: [],
  });

const githubStarsGained = (rank: number): number => 1_200 + rank;

const githubTrendingAppendix = () => ({
  id: "github-trending",
  kind: "watch" as const,
  title: "GitHub Trending",
  text: githubTrendingWatchText(
    Array.from({ length: 3 }, (_, index) => {
      const rank = index + 1;
      return {
        repositoryIdentity: `owner/repository-${rank}`,
        rank,
        starsGained: githubStarsGained(rank),
      };
    }),
  ),
  citationIds: Array.from(
    { length: 3 },
    (_, index) => `github-citation-${index + 1}`,
  ),
});
