import {
  FixedClock,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import { ReaderSummaryArtifact, ReaderSummaryJob, workspaceReaderSummaryScope } from "../../domain";
import { readerDisplayPublicationFindings } from "../../domain/policies/reader-summary-display-publication";
import {
  artifact,
  content,
} from "../../domain/policies/reader-summary-publication-policy-test-fixtures";
import { ExecuteReaderSummaryJobUseCase } from "../../features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import {
  NOOP_READER_SUMMARY_PROMOTION_METRICS,
  readerSummaryPromotionControl,
} from "../../features/execute-reader-summary-job/reader-summary-promotion-control";
import {
  PromotionControlArtifactRepository,
  PromotionControlCapturingModel,
  PromotionControlEventPublisher,
  PromotionControlIdGenerator,
  PromotionControlPolicyRepository,
  PromotionControlPublication,
  promotionControlEmptyTopicMapBuilder,
  promotionControlPeriod,
  promotionControlZeroGitHubProjectionReader,
} from "../../features/execute-reader-summary-job/execute-reader-summary-job-promotion-control.spec-support";
import { FakeReaderSummaryJobRepository } from "../../features/execute-reader-summary-job/execute-reader-summary-job.spec-support";
import { presentReaderSummaryArtifact } from "../../features/shared/reader-summary-artifact-presenter";
import { headlineFallback } from "../../adapters/persistence/prisma/reader-headline-artifact.spec-support";
import { serializeReaderSummaryArtifact } from "../../adapters/persistence/prisma/prisma-reader-summary-json";
import { normalizeReaderSummaryArtifactPayload } from "../../adapters/persistence/prisma/prisma-reader-summary-artifact-payload";
import {
  hackerNewsEvidence,
  redditEvidence,
  selection,
  storyCluster,
  xEvidence,
} from "../../adapters/evidence/reader-summary-editorial-slate.spec-support";
import { project } from "../../adapters/evidence/reader-summary-faithful-source.spec-support";
import { buildReaderSummaryEvidenceCitationMap } from "../../adapters/model/reader-summary-evidence-citation-map";
import {
  makeUnmaterializedReaderEvidenceSelection,
  withReaderPromotionEditorialSlate,
} from "../../test-fixtures/execute-reader-summary-job-promotion-fixtures";
import { readerSummaryArtifactViewFromReaderSummaryView } from "./reader-summary-rest.mapper";

const uuid = "e2bd4886-3735-41ed-8db6-b314e7474a6e";
const uuidBody =
  `Bug in source item ${uuid} landed in production Flutter tooling.`;

const persistPresent = (published: ReaderSummaryArtifact) => {
  const loaded = ReaderSummaryArtifact.rehydrate(normalizeReaderSummaryArtifactPayload(
    structuredClone(serializeReaderSummaryArtifact(published)),
    headlineFallback(published),
  ));
  const view = presentReaderSummaryArtifact(loaded, {
    status: "fresh", checkedAt: new Date("2026-07-05T09:00:00Z"),
  });
  return { loaded, view, response: readerSummaryArtifactViewFromReaderSummaryView(view) };
};

const mixedUuidLeads = () => {
  const unavailable = { status: "unavailable" as const, reasonCode: "not_assessed" as const };
  return [
    { ...hackerNewsEvidence("hn-useful", 180), sourceText: uuidBody, readerHeadline: unavailable },
    { ...redditEvidence("reddit-useful", 749), sourceText: uuidBody, readerHeadline: unavailable },
    {
      ...xEvidence("x-useful", 23_396),
      title: `X post by @atlas: ${uuidBody}`,
      sourceText: uuidBody,
      readerHeadline: unavailable,
    },
  ];
};

class ProductionCitationCapturingModel extends PromotionControlCapturingModel {
  override async generate(
    input: Parameters<PromotionControlCapturingModel["generate"]>[0],
    route: Parameters<PromotionControlCapturingModel["generate"]>[1],
  ) {
    const generated = await super.generate(input, route);
    const citationMap = buildReaderSummaryEvidenceCitationMap(
      input.evidence.selectedEvidence,
    );
    const social = input.evidence.selectedEvidence.filter(
      (item) => item.providerKey !== "github-trending-page",
    );
    return {
      ...generated,
      draft: {
        ...generated.draft,
        citationMap,
        topStories: social.map((item) => ({
          storyClusterId: input.evidence.clusters.find(
            (cluster) => cluster.representativeFeedItemId === item.feedItemId,
          )!.id,
          title: item.providerKey === "x-twitter"
            ? "Developers discuss a Flutter tooling regression"
            : item.title,
          summary: "Selected by the mixed source-title scenario.",
          interestIds: [item.interestId],
          providerKeys: [item.providerKey],
          citationIds: [citationMap.find((citation) =>
            citation.feedItemId === item.feedItemId)!.citationId],
        })),
        content: {
          ...generated.draft.content!,
          narrativeSections: [{
            id: "lead",
            kind: "lead" as const,
            title: "Overview",
            text: "Developers compare runtime regressions across Hacker News, Reddit, and X.",
            citationIds: citationMap
              .filter((citation) => citation.providerKey !== "github-trending-page")
              .map((citation) => citation.citationId),
          }],
        },
      },
    };
  }
}

const mixedJobSelection = (scope: { tenantId: string; workspaceId: string }) => {
  const evidence = makeUnmaterializedReaderEvidenceSelection();
  const reddit = evidence.selectedEvidence[0]!;
  const xLead = {
    ...reddit,
    feedItemId: "feed-x",
    sourceItemId: "x-post-1",
    sourceBindingId: "binding-x",
    providerKey: "x-twitter",
    providerName: "X",
    canonicalUrl: "https://x.example.test/status/1",
    title: `X post by @atlas: ${uuidBody}`,
    bodyPreview: uuidBody,
    sourceText: uuidBody,
    promotionFacts: {
      ...reddit.promotionFacts!,
      contentKind: "original_post" as const,
      canonicalIdentity: "story:uuid-source-title",
      metrics: { provider: "x" as const, likes: 3230, reposts: 0, weightedScore: 3230 },
    },
  };
  const hnLead = {
    ...reddit,
    feedItemId: "feed-hn",
    sourceItemId: "hn-1",
    sourceBindingId: "binding-hn",
    providerKey: "hacker-news",
    providerName: "Hacker News",
    canonicalUrl: "https://news.example.test/item/1",
    title: "Concrete HN runtime discussion",
    bodyPreview: "Users discuss a runtime regression on Hacker News.",
    sourceText: "Users discuss a runtime regression on Hacker News.",
    promotionFacts: {
      ...reddit.promotionFacts!,
      contentKind: "story" as const,
      canonicalIdentity: "story:hn-runtime",
      metrics: { provider: "hacker_news" as const, points: 180 },
    },
  };
  return withReaderPromotionEditorialSlate({
    ...evidence,
    sourceWindow: {
      ...evidence.sourceWindow,
      selectedFeedItemIds: [
        ...evidence.sourceWindow.selectedFeedItemIds,
        xLead.feedItemId,
        hnLead.feedItemId,
      ],
      storyClusterIds: [
        ...evidence.sourceWindow.storyClusterIds,
        "cluster-x",
        "cluster-hn",
      ],
    },
    selectedEvidence: evidence.selectedEvidence.map((item) => ({
      ...item,
      sourceText: item.bodyPreview,
    })).concat(xLead, hnLead),
    clusters: [
      ...evidence.clusters,
      {
        ...evidence.clusters[0]!,
        id: "cluster-x",
        storyKey: "uuid-source-title",
        representativeFeedItemId: xLead.feedItemId,
        providerKeys: ["x-twitter"],
      },
      {
        ...evidence.clusters[0]!,
        id: "cluster-hn",
        storyKey: "hn-runtime",
        representativeFeedItemId: hnLead.feedItemId,
        providerKeys: ["hacker-news"],
      },
    ],
  }, scope);
};

describe("source-title publication persist and REST", () => {
  it("keeps mixed unassessed UUID cards after persist and REST", () => {
    const items = mixedUuidLeads();
    const projection = project(items);
    const input = selection(items, items.map((item) => storyCluster(item.feedItemId, [item])));
    const fixture = artifact().toSnapshot();
    const published = ReaderSummaryArtifact.create({
      ...fixture,
      readerSummaryId: "faithful-source-fixture",
      generatedAt: input.sourceWindow.endedAt,
      period: {
        cadence: "daily",
        timezone: "UTC",
        startedAt: input.sourceWindow.startedAt,
        endedAt: input.sourceWindow.endedAt,
        periodKey: "daily:2026-08-29T00:00:00.000Z:2026-08-30T00:00:00.000Z:UTC",
      },
      sourceWindow: input.sourceWindow,
      storyClusters: projection.admittedClusters,
      topStories: projection.topReads.map((card) => ({
        storyClusterId: card.storyClusterId!,
        title: card.title,
        summary: "The source discusses a concrete product update.",
        interestIds: [items[0]!.interestId],
        providerKeys: [card.providerKey],
        citationIds: card.citationIds,
      })),
      citationMap: projection.admittedCitations,
      promotionAttestations: projection.attestations,
      promotionEvidenceFacts: projection.attestedEvidenceFacts,
      content: content({
        topReads: projection.topReads,
        selectedPosts: projection.additionalPosts,
        interestSections: [],
        narrativeSections: [],
        sourceMix: items.map((item) => ({
          providerKey: item.providerKey,
          itemCount: 1,
          citationCount: 1,
          storyClusterCount: 1,
          crossSourceClusterCount: 0,
          singleSourceOnly: true,
          interestIds: [item.interestId],
        })),
      }),
    });
    expect(readerDisplayPublicationFindings(published.toSnapshot(), input)).toEqual([]);
    const { loaded, response } = persistPresent(published);
    expect(readerDisplayPublicationFindings(loaded.toSnapshot(), input)).toEqual([]);
    const cards = [...response.readerBrief.topReads, ...response.readerBrief.selectedPosts];
    expect(cards.map((card) => card.providerKey).sort()).toEqual([
      "hacker-news", "reddit", "x-twitter",
    ]);
    expect(cards.every((card) =>
      card.displayHeadline?.status === "unavailable" &&
      card.displayHeadline.reasonCode === "not_assessed")).toBe(true);
    expect(cards.some((card) => card.title.includes(uuid))).toBe(true);
  });

  it("publishes a job source-title card through persist and REST", async () => {
    const jobId = "reader-job-source-title-persist-rest";
    const tenant = tenantId(`tenant-${jobId}`);
    const workspace = workspaceId(`workspace-${jobId}`);
    const jobs = new FakeReaderSummaryJobRepository();
    await jobs.save(ReaderSummaryJob.request({
      id: jobId,
      tenantId: tenant,
      workspaceId: workspace,
      scope: workspaceReaderSummaryScope(),
      period: promotionControlPeriod,
      idempotencyKey: `${jobId}-key`,
      requestedAt: new Date("2026-06-26T08:00:00.000Z"),
    }));
    const artifacts = new PromotionControlArtifactRepository();
    const events = new PromotionControlEventPublisher();
    const result = await new ExecuteReaderSummaryJobUseCase(
      jobs,
      artifacts,
      new PromotionControlPolicyRepository(),
      {
        select: async () => mixedJobSelection({ tenantId: tenant, workspaceId: workspace }),
      },
      new ProductionCitationCapturingModel(),
      new PromotionControlPublication(jobs, artifacts, events),
      new PromotionControlIdGenerator(),
      new FixedClock(new Date("2026-06-26T08:05:00.000Z")),
      readerSummaryPromotionControl(NOOP_READER_SUMMARY_PROMOTION_METRICS),
      undefined,
      undefined,
      promotionControlEmptyTopicMapBuilder(),
      undefined,
      promotionControlZeroGitHubProjectionReader(),
    ).execute({ tenantId: tenant, workspaceId: workspace, readerSummaryJobId: jobId });
    if (!result.ok) throw result.error;
    expect(result.value).toMatchObject({ status: "completed" });
    const published = artifacts.all()[0];
    expect(published).toBeDefined();
    const { response } = persistPresent(published!);
    const cards = [...response.readerBrief.topReads, ...response.readerBrief.selectedPosts];
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((card) =>
      card.displayHeadline?.status === "unavailable" &&
      card.displayHeadline.reasonCode === "not_assessed")).toBe(true);
    expect(cards.map((card) => card.providerKey).sort()).toEqual([
      "hacker-news", "reddit", "x-twitter",
    ]);
    expect(cards.some((card) => card.providerKey === "x-twitter" && card.title.includes(uuid)))
      .toBe(true);
  });
});
