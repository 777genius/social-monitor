import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryArtifact,
  ReaderSummaryPublicationDecision,
  ReaderSummaryPublicationPolicy,
  SummaryEvidenceSelection,
} from "../../domain";
import { readerSummaryHasVerifiedGitHubProjection } from "../../domain";
import type {
  ReadReaderSummaryGitHubProjectionQuery,
  ReaderSummaryGitHubProjectionReaderPort,
} from "../../ports";
import { evaluateReaderSummaryPrepublication } from "./reader-summary-prepublication-gate";

describe("evaluateReaderSummaryPrepublication", () => {
  it("fails closed before publication when the durable projection is unavailable", async () => {
    const decision = await evaluateReaderSummaryPrepublication({
      artifact: githubArtifact(),
      evidence: {} as SummaryEvidenceSelection,
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
          eligibleBindingIds: ["binding-github"],
          items: projectionItems(),
          pageCount: 2,
        };
      },
    };

    const decision = await evaluateReaderSummaryPrepublication({
      artifact: githubArtifact(),
      evidence: {} as SummaryEvidenceSelection,
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
      eligibleBindingIds: ["binding-github"],
      bindings: expect.arrayContaining([
        expect.objectContaining({
          rank: 1,
          providerKey: "github-trending-page",
          metadataKind: "github_trending_page_repository",
          scanJobId: "scan-github-prepublication",
          fetchStartedAt: "2026-07-10T12:00:00.000Z",
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
    ).toEqual(new Set(["scan-github-prepublication"]));
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
    const artifact = {
      toSnapshot: () => ({
        tenantId: tenant,
        workspaceId: workspace,
        scope: { type: "workspace" },
        period: {
          cadence: "daily",
          startedAt: dayStartedAt,
          endedAt: dayEndedAt,
          timezone: "UTC",
          periodKey: "daily:2026-07-10:UTC",
        },
        content: { selectedPosts: [], narrativeSections: [] },
        citationMap: [],
      }),
    } as unknown as ReaderSummaryArtifact;

    const decision = await evaluateReaderSummaryPrepublication({
      artifact,
      evidence: {} as SummaryEvidenceSelection,
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

  it("rejects zero GitHub artifact evidence when an eligible binding exists", async () => {
    const decision = await evaluateReaderSummaryPrepublication({
      artifact: artifactWithoutGitHubBoard(),
      evidence: {} as SummaryEvidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: {
        async read() {
          return {
            eligibleBindingIds: ["binding-github"],
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

  it("permits only an explicit historical omission with no GitHub evidence", async () => {
    let readCount = 0;
    const artifact = artifactWithoutGitHubBoard();
    const decision = await evaluateReaderSummaryPrepublication({
      artifact,
      evidence: {} as SummaryEvidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: {
        async read() {
          readCount += 1;
          throw new Error("historical omission must not query projection");
        },
      },
      observedThrough,
      historicalGitHubOmission: {
        reason: "No timestamp-valid GitHub snapshot exists for this day.",
        authorizedAt: observedThrough,
      },
    });

    expect(readCount).toBe(0);
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

  it("rejects a partial GitHub selectedPosts board before persistence", async () => {
    const decision = await evaluateReaderSummaryPrepublication({
      artifact: githubArtifact(5),
      evidence: {} as SummaryEvidenceSelection,
      publicationPolicy: publishingPolicy(),
      githubProjectionReader: {
        async read() {
          return {
            eligibleBindingIds: ["binding-github"],
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
    const artifact = artifactWithoutGitHubBoard({
      cadence: "weekly",
      startedAt: new Date("2026-07-06T00:00:00.000Z"),
      endedAt: new Date("2026-07-13T00:00:00.000Z"),
      periodKey: "weekly:2026-07-06:UTC",
    });

    const decision = await evaluateReaderSummaryPrepublication({
      artifact,
      evidence: {} as SummaryEvidenceSelection,
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
  }) as ReaderSummaryPublicationPolicy;

const githubArtifact = (selectedPostCount = 10): ReaderSummaryArtifact =>
  ({
    toSnapshot: () => ({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      period: {
        cadence: "daily",
        startedAt: dayStartedAt,
        endedAt: dayEndedAt,
        timezone: "UTC",
        periodKey: "daily:2026-07-10:UTC",
      },
      content: {
        selectedPosts: Array.from({ length: selectedPostCount }, (_, index) => {
          const rank = index + 1;
          return {
            providerKey: "github-trending-page",
            canonicalUrl: `https://github.com/owner/repo-${rank}`,
            citationIds: [`citation-${rank}`],
            providerMetrics: [
              {
                label: "GitHub Trending today",
                value: `#${rank}, +${100 + rank} stars today`,
              },
            ],
          };
        }),
        narrativeSections: [],
      },
      citationMap: Array.from({ length: 10 }, (_, index) => {
        const rank = index + 1;
        return {
          citationId: `citation-${rank}`,
          feedItemId: `feed-${rank}`,
          sourceItemId: `source-${rank}`,
          providerKey: "github-trending-page",
          canonicalUrl: `https://github.com/owner/repo-${rank}`,
        };
      }),
    }),
  }) as unknown as ReaderSummaryArtifact;

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
    periodKey: "daily:2026-07-10:UTC",
  },
): ReaderSummaryArtifact =>
  ({
    toSnapshot: () => ({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      period: {
        cadence: period.cadence,
        startedAt: period.startedAt,
        endedAt: period.endedAt,
        timezone: "UTC",
        periodKey: period.periodKey,
      },
      content: { selectedPosts: [], narrativeSections: [] },
      citationMap: [],
    }),
  }) as unknown as ReaderSummaryArtifact;

const projectionItems = () =>
  Array.from({ length: 10 }, (_, index) => {
    const rank = index + 1;
    return {
      feedItemId: `feed-${rank}`,
      sourceItemId: `source-${rank}`,
      sourceBindingId: "binding-github",
      providerKey: "github-trending-page",
      metadataKind: "github_trending_page_repository",
      scanJobId: "scan-github-prepublication",
      canonicalUrl: `https://github.com/owner/repo-${rank}`,
      repositoryFullName: `owner/repo-${rank}`,
      rank,
      starsGained: 100 + rank,
      window: "daily",
      fetchStartedAt: new Date("2026-07-10T12:00:00.000Z"),
      checkedAt: new Date("2026-07-10T12:00:00.000Z"),
      publishedAt: new Date("2026-07-10T12:00:00.000Z"),
      observedAt: new Date("2026-07-10T12:05:00.000Z"),
      sourceContentHash: "a".repeat(64),
      sourceProviderContentHash: "b".repeat(64),
    };
  });

const tenant = tenantId("tenant-prepublication-gate");
const workspace = workspaceId("workspace-prepublication-gate");
const dayStartedAt = new Date("2026-07-10T00:00:00.000Z");
const dayEndedAt = new Date("2026-07-11T00:00:00.000Z");
const observedThrough = new Date("2026-07-11T01:00:00.000Z");
