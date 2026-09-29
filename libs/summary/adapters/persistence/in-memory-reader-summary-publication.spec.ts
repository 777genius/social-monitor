import { eventId, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  githubTrendingWatchText,
  ReaderSummaryJob,
  readerSummaryWorkspaceManifestSha256,
  readerSummaryGitHubProjectionCollectionGraceMs,
  readerSummaryGitHubProjectionCollectionWarningThresholdMs,
} from "../../domain";
import type {
  ReaderSummaryPublicationCommand,
  ReaderSummaryV3PreparationSourcePort,
  SummaryEventPublisherPort,
} from "../../ports";
import { InMemorySummaryEventPublisher } from "../messaging/in-memory-summary-event-publisher";
import { InMemoryReaderSummaryArtifactRepository } from "./in-memory-reader-summary-artifact.repository";
import { InMemoryReaderSummaryJobRepository } from "./in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryPublication } from "./in-memory-reader-summary-publication";
import {
  buildReaderSummaryAuthorizedPublicationProof,
  buildReaderSummaryPublicationPayload,
  stablePublicationJson,
} from "./reader-summary-publication-proof";

describe("InMemoryReaderSummaryPublication", () => {
  it.each(["COMPLETED", "NO_SIGNAL"] as const)(
    "publishes and semantically replays %s exactly once",
    async (semanticStatus) => {
      const fixture = createFixture({ semanticStatus, sequence: 1 });
      const context = await createContext(fixture.command);

      await expect(context.publication.publish(fixture.command)).resolves.toBe(
        "published",
      );
      await expect(context.publication.publish(fixture.command)).resolves.toBe(
        "replayed",
      );
      await expect(
        context.publication.publish({
          ...fixture.command,
          readyEvent: {
            ...fixture.command.readyEvent,
            eventId: eventId("30000000-0000-4000-8000-999999999999"),
          },
        }),
      ).rejects.toThrow("idempotency conflict");
      await expect(context.artifacts.findById(fixture.identity)).resolves.toBe(
        fixture.command.artifact,
      );
      expect(context.events.all()).toHaveLength(1);
      expect(context.jobs.all()).toHaveLength(1);
    },
  );

  it("serializes a real concurrent equal-requestedAt race to one winner", async () => {
    const left = createFixture({ semanticStatus: "COMPLETED", sequence: 2 });
    const right = createFixture({
      semanticStatus: "COMPLETED",
      sequence: 3,
      requestedAt: left.requestedAt,
    });
    const context = await createContext(left.command, right.command);

    const outcomes = await Promise.all([
      context.publication.publish(left.command),
      context.publication.publish(right.command),
    ]);

    expect([...outcomes].sort()).toEqual(["published", "stale"]);
    expect(context.events.all()).toHaveLength(1);
    await expect(context.artifacts.findById(left.identity)).resolves.toBe(
      left.command.artifact,
    );
    await expect(
      context.artifacts.findById(right.identity),
    ).resolves.toBeNull();
  });

  it("rejects a mismatched ready event before a candidate becomes visible", async () => {
    const fixture = createFixture({ semanticStatus: "COMPLETED", sequence: 4 });
    const invalid = {
      ...fixture.command,
      readyEvent: {
        ...fixture.command.readyEvent,
        correlationId: "00000000-0000-4000-8000-000000000999",
      },
    } as ReaderSummaryPublicationCommand;
    const context = await createContext(invalid);

    await expect(context.publication.publish(invalid)).rejects.toThrow(
      "exact publication binding",
    );
    await expect(
      context.artifacts.findById(fixture.identity),
    ).resolves.toBeNull();
    expect(context.events.all()).toHaveLength(0);
  });

  it("keeps the candidate hidden when event publication fails", async () => {
    const fixture = createFixture({ semanticStatus: "COMPLETED", sequence: 5 });
    const jobs = new InMemoryReaderSummaryJobRepository();
    const artifacts = new InMemoryReaderSummaryArtifactRepository();
    await artifacts.save(fixture.command.artifact, {
      publicationDecision: fixture.command.publicationDecision,
      githubProjectionAudit: fixture.command.githubProjectionAudit,
    });
    const publication = new InMemoryReaderSummaryPublication(
      jobs,
      artifacts,
      new ThrowingSummaryEventPublisher(),
    );

    await expect(publication.publish(fixture.command)).rejects.toThrow(
      "fixture event failure",
    );
    await expect(artifacts.findById(fixture.identity)).resolves.toBeNull();
    expect(jobs.all()).toEqual([]);
  });

  it("builds a stable report SHA and exact requested UTC date proof", () => {
    const fixture = createFixture({ semanticStatus: "COMPLETED", sequence: 6 });
    const first = buildReaderSummaryPublicationPayload(fixture.command);
    const second = buildReaderSummaryPublicationPayload(fixture.command);
    const discriminated = buildReaderSummaryAuthorizedPublicationProof({
      kind: "daily",
      command: fixture.command,
    });

    expect(second).toEqual(first);
    expect(JSON.stringify(discriminated)).toBe(JSON.stringify(first));
    expect(stablePublicationJson(first.report)).toBe(first.reportCanonical);
    expect(first.requestedUtcDate).toBe("2026-07-05");
    expect(first.exactProof).toMatchObject({
      tenantId: fixture.identity.tenantId,
      workspaceId: fixture.identity.workspaceId,
      readerSummaryJobId: fixture.jobId,
      readerSummaryArtifactId: fixture.identity.readerSummaryId,
      reportSha256: first.reportSha256,
    });
    expect(first.report.qualitySignals).toMatchObject({
      githubProjectionAudit: fixture.command.githubProjectionAudit,
    });
  });

  it("persists GitHub collection delay warning telemetry in the report", () => {
    const fixture = createFixture({
      semanticStatus: "COMPLETED",
      sequence: 8,
      githubProjectionDelayMs:
        readerSummaryGitHubProjectionCollectionWarningThresholdMs,
    });

    const payload = buildReaderSummaryPublicationPayload(fixture.command);

    expect(payload.report.qualitySignals).toMatchObject({
      githubProjectionAudit: {
        status: "verified",
        telemetry: {
          github_projection_collection_delay_ms:
            readerSummaryGitHubProjectionCollectionWarningThresholdMs,
          collectionGraceMs: readerSummaryGitHubProjectionCollectionGraceMs,
          warningThresholdMs:
            readerSummaryGitHubProjectionCollectionWarningThresholdMs,
          qualitySignal: "github_projection_collection_delay_warning",
        },
      },
    });
  });

  it("rejects a forged GitHub audit before any publication side effect", async () => {
    const fixture = createFixture({ semanticStatus: "COMPLETED", sequence: 7 });
    const invalid = {
      ...fixture.command,
      githubProjectionAudit: {
        ...fixture.command.githubProjectionAudit,
        requestedUtcDay: "2026-07-04",
      },
    };
    const context = await createContext(fixture.command);

    await expect(context.publication.publish(invalid)).rejects.toThrow(
      "exact verified GitHub projection audit",
    );
    await expect(
      context.artifacts.findById(fixture.identity),
    ).resolves.toBeNull();
    expect(context.events.all()).toEqual([]);
    expect(context.jobs.all()).toHaveLength(1);
    expect(context.jobs.all()[0]?.toSnapshot().status).toBe("running");
  });

  // Regression: an in-memory workspace V3 publication must enforce its frozen
  // active-interest configuration and full candidate coverage before exposing
  // a no-signal artifact; an exact post-commit replay remains idempotent.
  it("guards workspace V3 scope and coverage while preserving exact replay", async () => {
    const fixture = workspaceV3NoSignalFixture(40);
    const context = await createContext(fixture.command);
    let changed = false;
    const source: ReaderSummaryV3PreparationSourcePort = {
      configuration: async () => ({ ok: true,
        config: changed ? { ...fixture.config, interests: [{
          ...fixture.config.interests[0]!, interestSha256: "b".repeat(64) }] }
          : fixture.config }),
      prepare: jest.fn(), coverage: async () => ({ status: "ready",
        hasPromotableSignal: false }),
    };
    const publication = new InMemoryReaderSummaryPublication(context.jobs,
      context.artifacts, context.events, source);

    await expect(publication.publish(fixture.command)).resolves.toBe("published");
    changed = true;
    await expect(publication.publish(fixture.command)).resolves.toBe("replayed");
    expect(context.events.all()).toHaveLength(1);
  });

  // Regression: a changed interest or revoked candidate after preparation
  // cannot turn a workspace V3 no-signal artifact visible in memory.
  it.each(["interest_changed", "binding_revoked"] as const)(
    "rejects workspace V3 publication when %s", async (failure) => {
      const fixture = workspaceV3NoSignalFixture(failure === "interest_changed" ? 41 : 42);
      const context = await createContext(fixture.command);
      const source: ReaderSummaryV3PreparationSourcePort = {
        configuration: async () => ({ ok: true,
          config: failure === "interest_changed"
            ? { ...fixture.config, interests: [{ ...fixture.config.interests[0]!,
              interestSha256: "b".repeat(64) }] }
            : fixture.config }),
        prepare: jest.fn(), coverage: async () => failure === "binding_revoked"
          ? { status: "unavailable", code: "assessment_unavailable" }
          : { status: "ready", hasPromotableSignal: false },
      };
      const publication = new InMemoryReaderSummaryPublication(context.jobs,
        context.artifacts, context.events, source);

      await expect(publication.publish(fixture.command)).rejects.toThrow(
        "Workspace V3 publication scope or coverage changed");
      await expect(context.artifacts.findById(fixture.identity)).resolves.toBeNull();
      expect(context.events.all()).toHaveLength(0);
    });

  // Regression: completed assessments with a qualifying primary candidate
  // must never be published as no signal after presentation fails or is skipped.
  it("rejects a workspace no-signal artifact with promotable evidence", async () => {
    const fixture = workspaceV3NoSignalFixture(43);
    const context = await createContext(fixture.command);
    const source: ReaderSummaryV3PreparationSourcePort = {
      configuration: async () => ({ ok: true, config: fixture.config }),
      prepare: jest.fn(), coverage: async () => ({ status: "ready",
        hasPromotableSignal: true }),
    };
    const publication = new InMemoryReaderSummaryPublication(context.jobs,
      context.artifacts, context.events, source);

    await expect(publication.publish(fixture.command)).rejects.toThrow(
      "Workspace V3 publication scope or coverage changed");
    await expect(context.artifacts.findById(fixture.identity)).resolves.toBeNull();
    expect(context.events.all()).toHaveLength(0);
  });

  // Regression: a selected card must not attest to another interest's rubric
  // or model configuration while reusing a correctly pinned FeedItem digest.
  it.each(["rubric", "model"] as const)(
    "rejects workspace V3 publication with a changed %s attestation", async (change) => {
      const fixture = workspaceV3ReadyFixture(change === "rubric" ? 44 : 45, change);
      const context = await createContext(fixture.command);
      const source: ReaderSummaryV3PreparationSourcePort = {
        configuration: async () => ({ ok: true, config: fixture.config }),
        prepare: jest.fn(), coverage: async () => ({ status: "ready",
          hasPromotableSignal: true }),
      };
      const publication = new InMemoryReaderSummaryPublication(context.jobs,
        context.artifacts, context.events, source);

      await expect(publication.publish(fixture.command)).rejects.toThrow(
        "Workspace V3 publication provenance changed");
      await expect(context.artifacts.findById(fixture.identity)).resolves.toBeNull();
      expect(context.events.all()).toHaveLength(0);
    });
});

const workspaceV3NoSignalFixture = (sequence: number) => {
  const fixture = createFixture({ semanticStatus: "NO_SIGNAL", sequence });
  const original = fixture.command.finalJob.toSnapshot();
  const cutoff = "2026-07-05T10:00:00.000000Z";
  const config = { schemaVersion: "reader_summary_preparation_config.v2" as const,
    interests: [{ schemaVersion: "reader_summary_preparation_config.v1" as const,
      interestId: "00000000-0000-4000-8000-000000000010",
      interestSha256: "a".repeat(64), rubricVersion: "rubric.v1",
      rubricSha256: "c".repeat(64), inputBuilderVersion: "input.v1",
      modelConfigVersion: "model.v1" }] };
  const manifest = { schemaVersion: "reader_summary_preparation_manifest.v2" as const,
    cutoffAt: cutoff, periodKey: original.period.periodKey,
    interests: config.interests, candidates: [] };
  const finalJob = ReaderSummaryJob.rehydrate({ ...original,
    selectionStrategy: "jev_primary_v3", preparationConfig: config,
    preparationManifest: manifest,
    preparationManifestSha256: readerSummaryWorkspaceManifestSha256(manifest),
    preparationCutoffAt: cutoff,
    preparationDeadlineAt: "2026-07-05T10:15:00.000000Z",
    preparationReadyAt: new Date(cutoff) });
  const artifactSnapshot = fixture.command.artifact.toSnapshot();
  const artifact = { toSnapshot: () => ({ ...artifactSnapshot,
    sourceWindow: { ...artifactSnapshot.sourceWindow,
      exactIngestionCutoff: cutoff, ingestionCutoff: new Date(cutoff) } }) };
  return { ...fixture, config, command: { ...fixture.command,
    finalJob, artifact } as ReaderSummaryPublicationCommand };
};

const workspaceV3ReadyFixture = (sequence: number, change: "rubric" | "model") => {
  const fixture = createFixture({ semanticStatus: "COMPLETED", sequence });
  const original = fixture.command.finalJob.toSnapshot();
  const cutoff = "2026-07-05T10:00:00.000000Z";
  const interestId = "00000000-0000-4000-8000-000000000010";
  const config = { schemaVersion: "reader_summary_preparation_config.v2" as const,
    interests: [{ schemaVersion: "reader_summary_preparation_config.v1" as const,
      interestId, interestSha256: "a".repeat(64),
      rubricVersion: "rubric.v1", rubricSha256: "c".repeat(64),
      inputBuilderVersion: "input.v1", modelConfigVersion: "model.v1" }] };
  const candidate = { candidateId: "00000000-0000-4000-8000-000000000020",
    interestId, sourceBindingId: "00000000-0000-4000-8000-000000000021",
    providerKey: "rss", sourceItemId: "00000000-0000-4000-8000-000000000022",
    sourceRevisionKey: "revision-1", sourceSnapshotSha256: "d".repeat(64),
    assessmentId: "00000000-0000-4000-8000-000000000023",
    inputSha256: "e".repeat(64), publishedAt: "2026-07-05T09:00:00.000000Z",
    observedAt: "2026-07-05T09:01:00.000000Z", sourceKind: "article",
    canonicalIdentity: "https://example.test/item" };
  const manifest = { schemaVersion: "reader_summary_preparation_manifest.v2" as const,
    cutoffAt: cutoff, periodKey: original.period.periodKey,
    interests: config.interests, candidates: [candidate] };
  const finalJob = ReaderSummaryJob.rehydrate({ ...original,
    selectionStrategy: "jev_primary_v3", preparationConfig: config,
    preparationManifest: manifest,
    preparationManifestSha256: readerSummaryWorkspaceManifestSha256(manifest),
    preparationCutoffAt: cutoff,
    preparationDeadlineAt: "2026-07-05T10:15:00.000000Z",
    preparationReadyAt: new Date(cutoff) });
  const artifactSnapshot = fixture.command.artifact.toSnapshot();
  const attestation = { schemaVersion: "reader_post_promotion_attestation.v3",
    candidateId: candidate.candidateId, exactIngestionCutoff: cutoff,
    assessment: { assessmentId: candidate.assessmentId,
      sourceSnapshotSha256: candidate.sourceSnapshotSha256,
      inputSha256: candidate.inputSha256, rubricVersion: "rubric.v1",
      rubricSha256: change === "rubric" ? "0".repeat(64) : "c".repeat(64),
      modelConfigVersion: change === "model" ? "other-model" : "model.v1" } };
  const artifact = { toSnapshot: () => ({ ...artifactSnapshot,
    promotionAttestations: [attestation],
    sourceWindow: { ...artifactSnapshot.sourceWindow,
      exactIngestionCutoff: cutoff, ingestionCutoff: new Date(cutoff) } }) };
  return { ...fixture, config, command: { ...fixture.command,
    finalJob, artifact } as ReaderSummaryPublicationCommand };
};

const createContext = async (
  ...commands: readonly ReaderSummaryPublicationCommand[]
) => {
  const jobs = new InMemoryReaderSummaryJobRepository();
  const artifacts = new InMemoryReaderSummaryArtifactRepository();
  const events = new InMemorySummaryEventPublisher();
  for (const command of commands) {
    const finalJob = command.finalJob.toSnapshot();
    await jobs.save(
      ReaderSummaryJob.rehydrate({
        ...finalJob,
        status: "running",
        completedAt: undefined,
        failedAt: undefined,
        readerSummaryId: undefined,
        failureReason: undefined,
      }),
    );
    await artifacts.save(command.artifact, {
      publicationDecision: command.publicationDecision,
      githubProjectionAudit: command.githubProjectionAudit,
    });
  }
  return {
    jobs,
    artifacts,
    events,
    publication: new InMemoryReaderSummaryPublication(jobs, artifacts, events),
  };
};

class ThrowingSummaryEventPublisher implements SummaryEventPublisherPort {
  async publish(): Promise<void> {
    throw new Error("fixture event failure");
  }
}

const createFixture = (params: {
  readonly semanticStatus: "COMPLETED" | "NO_SIGNAL";
  readonly sequence: number;
  readonly requestedAt?: Date;
  readonly githubProjectionDelayMs?: number;
}) => {
  const suffix = String(params.sequence).padStart(12, "0");
  const tenant = tenantId("00000000-0000-4000-8000-000000000001");
  const workspace = workspaceId("00000000-0000-4000-8000-000000000002");
  const jobId = `10000000-0000-4000-8000-${suffix}`;
  const artifactId = `20000000-0000-4000-8000-${suffix}`;
  const eventId = `30000000-0000-4000-8000-${suffix}`;
  const requestedAt =
    params.requestedAt ?? new Date("2026-07-05T10:00:00.000Z");
  const period = {
    cadence: "daily" as const,
    startedAt: new Date("2026-07-05T00:00:00.000Z"),
    endedAt: new Date("2026-07-06T00:00:00.000Z"),
    timezone: "UTC",
    periodKey: "daily:2026-07-05T00:00:00.000Z:2026-07-06T00:00:00.000Z:UTC",
  };
  const scope = { type: "workspace" as const };
  const noSignal = params.semanticStatus === "NO_SIGNAL";
  const githubProjectionDelayMs = params.githubProjectionDelayMs ?? 0;
  const githubFetchStartedAt = new Date(period.endedAt.getTime() - 60_000);
  const githubCheckedAt = new Date(period.endedAt.getTime() - 1);
  const githubObservedAt = new Date(
    period.endedAt.getTime() + githubProjectionDelayMs,
  );
  const githubCitations = Array.from({ length: 10 }, (_, index) => {
    const rank = index + 1;
    return {
      citationId: `github-citation-${rank}`,
      feedItemId: `github-feed-${rank}`,
      sourceItemId: `github-source-${rank}`,
      providerKey: "github-trending-page",
      canonicalUrl: `https://github.com/owner/repository-${rank}`,
    };
  });
  const githubSelectedPosts = githubCitations.map((citation, index) => {
    const rank = index + 1;
    return {
      providerKey: "github-trending-page",
      canonicalUrl: citation.canonicalUrl,
      citationIds: [citation.citationId],
      providerMetrics: [
        {
          label: "GitHub Trending today",
          value: `#${rank}, +${githubStarsGained(rank)} stars today`,
        },
      ],
    };
  });
  const artifactSnapshot = {
    schemaVersion: "reader_summary.artifact.v1" as const,
    readerSummaryId: artifactId,
    tenantId: tenant,
    workspaceId: workspace,
    scope,
    period,
    generatedAt: new Date("2026-07-05T10:30:00.000Z"),
    sourceWindow: {
      windowId: "publication-test-window",
      startedAt: period.startedAt,
      endedAt: period.endedAt,
      selectedFeedItemIds: noSignal
        ? []
        : githubCitations.map((citation) => citation.feedItemId),
      storyClusterIds: [],
    },
    storyClusters: [],
    contextArtifacts: [],
    headline: noSignal ? "No reliable signal" : "Reader summary proof",
    executiveSummary: noSignal ? "No eligible evidence." : "Proved summary.",
    topStories: [],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: noSignal ? [] : githubCitations,
    content: noSignal
      ? {
          qualityState: {
            status: "no_signal",
            flags: ["no_signal"],
            warnings: ["No eligible evidence."],
            isSingleSource: false,
          },
          topReads: [],
          selectedPosts: [],
          narrativeSections: [],
        }
      : {
          selectedPosts: githubSelectedPosts,
          narrativeSections: [
            {
              id: "github-trending",
              kind: "watch" as const,
              title: "GitHub Trending",
              text: githubTrendingWatchText(
                githubSelectedPosts.slice(0, 3).map((_, index) => {
                  const rank = index + 1;
                  return {
                    repositoryIdentity: `owner/repository-${rank}`,
                    rank,
                    starsGained: githubStarsGained(rank),
                  };
                }),
              ),
              citationIds: githubCitations
                .slice(0, 3)
                .map((citation) => citation.citationId),
            },
          ],
        },
    qualityFlags: noSignal ? ["no_signal"] : [],
    confidence: {
      level: noSignal ? "none" : "medium",
      score: noSignal ? 0 : 0.7,
      rationale: "Publication fixture",
    },
    lineage: {
      promptVersion: "reader-summary.prompt.publication-test.v1",
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion: "codex:gpt-5.5:xhigh",
      providerVersion: "fixture",
      rulesVersion: "reader-summary.rules.v1",
      evalDatasetVersion: "reader-summary.eval.v1",
    },
    usage: { inputTokens: 10, outputTokens: 5, estimatedCostUsd: 0 },
    ...(noSignal ? { noSignalReason: "No eligible evidence." } : {}),
  };
  const finalStatus = noSignal ? "no_signal" : "completed";
  const completedAt = githubObservedAt;
  const finalJobSnapshot = {
    id: jobId,
    tenantId: tenant,
    workspaceId: workspace,
    scope,
    period,
    status: finalStatus,
    idempotencyKey: `publication-test:${jobId}`,
    requestedAt,
    startedAt: requestedAt,
    completedAt,
    readerSummaryId: artifactId,
  };
  const readyEvent = {
    eventId,
    eventType: "reader_summary.ready" as const,
    schemaVersion: 1 as const,
    occurredAt: completedAt,
    tenantId: tenant,
    workspaceId: workspace,
    correlationId: jobId,
    causationId: jobId,
    payload: {
      readerSummaryJobId: jobId,
      readerSummaryId: artifactId,
      tenantId: tenant,
      workspaceId: workspace,
      scope,
      period,
      status: finalStatus,
    },
  };
  const command = {
    artifact: { toSnapshot: () => artifactSnapshot },
    finalJob: { toSnapshot: () => finalJobSnapshot },
    publicationDecision: {
      status: "published" as const,
      qualityPassed: true as const,
      canonicalScore: 1,
      shadow: {
        mode: "shadow" as const,
        policyVersion: "reader_summary_publication_shadow_v1" as const,
        riskScore: 0,
        signals: [],
      },
      reasons: [],
    },
    githubProjectionAudit: noSignal
      ? {
          schemaVersion: "reader_summary.github_projection.v1" as const,
          status: "not_required" as const,
          requestedUtcDay: "2026-07-05",
          pageCount: 1,
          scannedItemCount: 0,
          eligibleBindingIds: [],
          bindings: [],
          violationCodes: [],
          reasons: [],
        }
      : {
          schemaVersion: "reader_summary.github_projection.v1" as const,
          status: "verified" as const,
          requestedUtcDay: "2026-07-05",
          pageCount: 1,
          scannedItemCount: 10,
          eligibleBindingIds: ["github-binding"],
          observedThrough: githubObservedAt.toISOString(),
          projectionCheckedAt: githubCheckedAt.toISOString(),
          telemetry: {
            github_projection_collection_delay_ms: githubProjectionDelayMs,
            collectionGraceMs: readerSummaryGitHubProjectionCollectionGraceMs,
            warningThresholdMs:
              readerSummaryGitHubProjectionCollectionWarningThresholdMs,
            qualitySignal:
              githubProjectionDelayMs >=
              readerSummaryGitHubProjectionCollectionWarningThresholdMs
                ? ("github_projection_collection_delay_warning" as const)
                : ("within_grace" as const),
          },
          bindings: githubCitations.map((citation, index) => {
            const rank = index + 1;
            return {
              selectedPostIndex: index,
              rank,
              citationId: citation.citationId,
              feedItemId: citation.feedItemId,
              sourceItemId: citation.sourceItemId,
              sourceBindingId: "github-binding",
              providerKey: "github-trending-page",
              metadataKind: "github_trending_page_repository",
              scanJobId: `github-publication-scan-${params.sequence}`,
              repositoryIdentity: `owner/repository-${rank}`,
              canonicalUrl: citation.canonicalUrl,
              starsGained: githubStarsGained(rank),
              fetchStartedAt: githubFetchStartedAt.toISOString(),
              publishedAt: githubCheckedAt.toISOString(),
              checkedAt: githubCheckedAt.toISOString(),
              observedAt: githubObservedAt.toISOString(),
              sourceContentHash: "a".repeat(64),
              sourceProviderContentHash: "b".repeat(64),
            };
          }),
          violationCodes: [],
          reasons: [],
        },
    readyEvent,
  } as unknown as ReaderSummaryPublicationCommand;

  return {
    command,
    requestedAt,
    jobId,
    identity: {
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryId: artifactId,
    },
  };
};

const githubStarsGained = (rank: number): number => 1_200 + rank;
