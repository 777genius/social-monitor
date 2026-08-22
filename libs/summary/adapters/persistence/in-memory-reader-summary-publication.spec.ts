import { eventId, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  githubTrendingWatchText,
  ReaderSummaryJob,
  readerSummaryGitHubProjectionCollectionGraceMs,
  readerSummaryGitHubProjectionCollectionWarningThresholdMs,
} from "../../domain";
import type {
  ReaderSummaryPublicationCommand,
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
      await expect(
        context.artifacts.findById(fixture.identity),
      ).resolves.toBe(fixture.command.artifact);
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
    await expect(context.artifacts.findById(right.identity)).resolves.toBeNull();
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
    await expect(context.artifacts.findById(fixture.identity)).resolves.toBeNull();
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
          collectionGraceMs:
            readerSummaryGitHubProjectionCollectionGraceMs,
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
    await expect(context.artifacts.findById(fixture.identity)).resolves.toBeNull();
    expect(context.events.all()).toEqual([]);
    expect(context.jobs.all()).toHaveLength(1);
    expect(context.jobs.all()[0]?.toSnapshot().status).toBe("running");
  });
});

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
  const requestedAt = params.requestedAt ?? new Date("2026-07-05T10:00:00.000Z");
  const period = {
    cadence: "daily" as const,
    startedAt: new Date("2026-07-05T00:00:00.000Z"),
    endedAt: new Date("2026-07-06T00:00:00.000Z"),
    timezone: "UTC",
    periodKey:
      "daily:2026-07-05T00:00:00.000Z:2026-07-06T00:00:00.000Z:UTC",
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
          bindings: githubCitations.slice(0, 3).map((citation, index) => {
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
