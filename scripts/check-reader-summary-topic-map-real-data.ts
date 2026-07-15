import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { Pool } from "pg";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { defaultPostgresRuntimePoolConfig } from "@social-monitor/platform-persistence";
import {
  FixedClock,
  type IdGenerator,
  ok,
} from "@social-monitor/shared-kernel";

import { PrismaFeedConnection } from "../libs/feed/adapters/persistence/prisma/prisma-feed-connection";
import { PrismaFeedItemReadRepository } from "../libs/feed/adapters/persistence/prisma/prisma-feed-item-read.repository";
import { InMemoryUserRelevanceProfileRepository } from "../libs/relevance/adapters/persistence/in-memory-user-relevance-profile.repository";
import { RankFeedItemsUseCase } from "../libs/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { RelevanceReaderSummaryEvidenceSelector } from "../libs/summary/adapters/evidence/relevance-reader-summary-evidence.selector";
import { StoryRankingMetricsRecorder } from "../libs/summary/adapters/metrics/story-ranking-metrics.recorder";
import { InMemorySummaryEventPublisher } from "../libs/summary/adapters/messaging/in-memory-summary-event-publisher";
import { DeterministicReaderSummaryModelAdapter } from "../libs/summary/adapters/model/deterministic-reader-summary-model.adapter";
import { InMemoryReaderSummaryArtifactRepository } from "../libs/summary/adapters/persistence/in-memory-reader-summary-artifact.repository";
import { InMemoryReaderSummaryJobRepository } from "../libs/summary/adapters/persistence/in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryPolicyRepository } from "../libs/summary/adapters/persistence/in-memory-reader-summary-policy.repository";
import {
  evaluateTopicLabelQuality,
  evaluateReaderSummaryTopicMapStructure,
  buildReaderSummaryTopicMap,
  buildReaderSummaryTopicMapEdges,
  buildReaderSummaryPeriod,
  ReaderSummaryPolicy,
  topicNodeId,
  type ReaderSummaryTopicMap,
  type SummaryEvidenceSelection,
} from "../libs/summary/domain";
import { ExecuteReaderSummaryJobUseCase } from "../libs/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { RequestReaderSummaryUseCase } from "../libs/summary/features/request-reader-summary/request-reader-summary.use-case";
import { presentReaderSummaryArtifact } from "../libs/summary/features/shared/reader-summary-artifact-presenter";
import type {
  EnqueueReaderSummaryJobCommand,
  ReaderSummaryJobQueuePort,
  SummaryQuotaPort,
} from "../libs/summary/ports";
import {
  collectionDateOptionOrDefault,
  type CollectionIntegrityStatus,
  fingerprint,
  message,
  nextDate,
  noRawSecretFragments,
  normalizeLineEndings,
  readCollectionIntegrityStatus,
  readDominantFeedScope,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";
import { isLocalDataSourceUnavailable } from "./lib/reader-summary-quality-eval-support";

type ProviderCount = {
  readonly providerKey: string;
  readonly count: number;
};

type SanitizedTopicMapFixture = {
  readonly groups: readonly {
    readonly id: string;
    readonly label: string;
    readonly colorKey: string;
    readonly nodeIds: readonly string[];
  }[];
  readonly nodes: readonly {
    readonly id: string;
    readonly label: string;
    readonly groupId: string;
    readonly popularityScore: number;
    readonly sizeWeight: number;
    readonly evidenceCount: number;
  }[];
  readonly edges: readonly {
    readonly sourceNodeId: string;
    readonly targetNodeId: string;
    readonly weight: number;
  }[];
};

type Report = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "reader-summary-topic-map-real-data-v1";
  readonly collectionDate: string;
  readonly generatedBy: string;
  readonly model: {
    readonly liveNetwork: false;
    readonly replayTarget: "workspace-reader-summary-topic-map";
    readonly modelProvider: "deterministic-local";
    readonly rawPostTextPersistedInReport: false;
  };
  readonly inputs: {
    readonly period: {
      readonly startedAt: string;
      readonly endedAt: string;
      readonly timezone: "UTC";
    };
    readonly maxEvidenceItems: number;
    readonly maxStories: number;
  };
  readonly collectionIntegrity: CollectionIntegrityStatus;
  readonly sourceData: {
    readonly feedItemCount: number;
    readonly providerCounts: readonly ProviderCount[];
  };
  readonly replay: {
    readonly tenantFingerprint: string;
    readonly workspaceFingerprint: string;
    readonly requestStatus: string;
    readonly executionStatus: string;
    readonly selectedFeedItemCount: number;
    readonly storyClusterCount: number;
    readonly topReadCount: number;
    readonly citationCount: number;
    readonly sourceMixProviderCounts: readonly ProviderCount[];
  };
  readonly topicMap: {
    readonly schemaVersion: ReaderSummaryTopicMap["schemaVersion"];
    readonly generatedBy: ReaderSummaryTopicMap["generatedBy"];
    readonly confidenceLevel: ReaderSummaryTopicMap["confidence"]["level"];
    readonly confidenceScore: number;
    readonly nodeCount: number;
    readonly groupCount: number;
    readonly edgeCount: number;
    readonly warningCount: number;
    readonly structureQuality: ReturnType<
      typeof evaluateReaderSummaryTopicMapStructure
    >;
    readonly topNodeFingerprints: readonly {
      readonly nodeFingerprint: string;
      readonly groupFingerprint: string;
      readonly popularityScore: number;
      readonly sizeWeight: number;
      readonly evidenceCount: number;
      readonly providerCount: number;
      readonly interestCount: number;
      readonly citationCount: number;
      readonly keywordCount: number;
    }[];
    readonly groupFingerprints: readonly {
      readonly groupFingerprint: string;
      readonly nodeCount: number;
      readonly colorKey: string;
      readonly confidenceScore: number;
    }[];
  };
  readonly weakLlmFallbackProbe: {
    readonly generatedBy: ReaderSummaryTopicMap["generatedBy"];
    readonly nodeCount: number;
    readonly groupCount: number;
    readonly weakInputNodeLabelCount: number;
    readonly acceptedNodeLabelCount: number;
    readonly acceptedGroupLabelCount: number;
    readonly rawPostTextPersistedInReport: false;
  };
  readonly visualFixture: SanitizedTopicMapFixture;
  readonly qualityGates: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

const { collectionDate } = collectionDateOptionOrDefault("2026-07-03");
const outputPath = "ops/evals/reader-summary-topic-map-real-data.v1.json";
const update = process.argv.includes("--update");
const artifactOnly = process.argv.includes("--artifact-only");
const allowDirtyCollection = process.argv.includes("--allow-dirty-collection");
const printJson = process.argv.includes("--print-json");
const maxEvidenceItems = 40;
const maxStories = 10;
const localDatabaseUrl = yesterdaySocialQualityDatabaseUrl();
const clock = new FixedClock(new Date(`${collectionDate}T23:59:59.000Z`));
const weakLlmProbeLabels = new Set(["ask", "show", "the", "why"]);

void main();

async function main(): Promise<void> {
  if (artifactOnly) {
    validateExistingReport();
    return;
  }

  const report = await tryBuildReport();

  if (report === undefined) {
    if (update) {
      throw new Error(
        "Local reader summary topic map source is unavailable; cannot update report.",
      );
    }
    validateExistingReport();
    return;
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (!report.blockingPassed) {
    console.error(serialized);
    throw new Error("Reader summary topic map real-data gates failed");
  }

  if (printJson) {
    console.log(serialized);
    return;
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:reader-summary-topic-map-real-data -- --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, "utf8"));
  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:reader-summary-topic-map-real-data -- --update`,
    );
  }

  console.log(`Reader summary topic map real-data OK (${collectionDate})`);
}

async function tryBuildReport(): Promise<Report | undefined> {
  try {
    return await buildReport();
  } catch (error) {
    if (!isLocalDataSourceUnavailable(error)) {
      throw error;
    }
    console.warn(
      `Reader summary topic map local source unavailable: ${message(error)}`,
    );
    return undefined;
  }
}

async function buildReport(): Promise<Report> {
  const scope = await readDominantFeedScope({
    databaseUrl: localDatabaseUrl,
    collectionDate,
  });
  const sourceData = await readSourceData(collectionDate);
  const connection = await PrismaFeedConnection.create(
    defaultPostgresRuntimePoolConfig(localDatabaseUrl, "admin-tool"),
  );

  try {
    const feedItems = new PrismaFeedItemReadRepository(connection);
    const jobs = new InMemoryReaderSummaryJobRepository();
    const artifacts = new InMemoryReaderSummaryArtifactRepository();
    const policies = new InMemoryReaderSummaryPolicyRepository();
    const queue = new CapturingReaderSummaryJobQueue();
    const events = new InMemorySummaryEventPublisher();
    const ids = new SequenceIdGenerator("reader-summary-topic-map-real-data");
    const period = buildReaderSummaryPeriod({
      cadence: "daily",
      startedAt: new Date(`${collectionDate}T00:00:00.000Z`),
      endedAt: new Date(nextDate(collectionDate)),
      timezone: "UTC",
    });

    await policies.save(
      ReaderSummaryPolicy.create({
        id: "reader-summary-topic-map-real-data-policy",
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        scope: { type: "workspace" },
        language: "auto",
        format: "executive_brief",
        tone: "analytical",
        maxStories,
        includeRisks: true,
        includeInterestHighlights: true,
        includeRepeatedSignals: true,
        dedupeStrategy: "canonical_url_then_title",
        customInstructions:
          "Build a concise reader-facing summary from cited evidence.",
        createdAt: clock.now(),
        updatedAt: clock.now(),
      }),
    );

    const request = await new RequestReaderSummaryUseCase(
      jobs,
      queue,
      new AllowingSummaryQuota(clock),
      ids,
      clock,
    ).execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      scope: { type: "workspace" },
      cadence: "daily",
      period,
      idempotencyKey: `reader-summary-topic-map-real-data:${collectionDate}`,
      correlationId: `reader-summary-topic-map-real-data:${collectionDate}`,
    });

    if (!request.ok) {
      throw request.error;
    }

    const rankFeedItems = new RankFeedItemsUseCase(
      feedItems,
      new InMemoryUserRelevanceProfileRepository(),
      clock,
    );
    const evidenceSelector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      feedItems,
      clock,
      new StoryRankingMetricsRecorder(new InMemoryMetricsRecorder()),
    );
    const replayEvidence = await evidenceSelector.select({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      scope: { type: "workspace" },
      period,
      maxItems: maxEvidenceItems,
    });
    const execution = await new ExecuteReaderSummaryJobUseCase(
      jobs,
      artifacts,
      policies,
      evidenceSelector,
      new DeterministicReaderSummaryModelAdapter(),
      events,
      ids,
      clock,
    ).execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      readerSummaryJobId: request.value.readerSummaryJobId,
      maxEvidenceItems,
    });

    if (!execution.ok) {
      throw execution.error;
    }
    if (execution.value.readerSummaryId === undefined) {
      throw new Error(
        "Reader summary topic map replay produced no artifact id",
      );
    }

    const artifact = await artifacts.findById({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      readerSummaryId: execution.value.readerSummaryId,
    });
    if (artifact === null) {
      throw new Error("Reader summary topic map replay artifact was not saved");
    }

    const view = presentReaderSummaryArtifact(artifact, {
      status: "fresh",
      checkedAt: clock.now(),
    });
    const topicMap = view.content.topicMap;
    const replay = {
      tenantFingerprint: fingerprint(scope.tenantId),
      workspaceFingerprint: fingerprint(scope.workspaceId),
      requestStatus: request.value.status,
      executionStatus: execution.value.status,
      selectedFeedItemCount: view.coverage.selectedFeedItemCount,
      storyClusterCount: view.coverage.storyClusterCount,
      topReadCount: view.coverage.topReadCount,
      citationCount: view.coverage.citationCount,
      sourceMixProviderCounts: view.content.sourceMix.map((source) => ({
        providerKey: source.providerKey,
        count: source.itemCount,
      })),
    };
    const collectionIntegrity = readCollectionIntegrityStatus(collectionDate);
    const nodeIds = new Set(topicMap.nodes.map((node) => node.id));
    const groupIds = new Set(topicMap.groups.map((group) => group.id));
    const visualFixture = sanitizedFixture(topicMap);
    const providerLabels = sourceData.providerCounts.map(
      (provider) => provider.providerKey,
    );
    const weakLlmFallbackProbe = buildWeakLlmFallbackProbe({
      evidence: replayEvidence,
      providerLabels,
    });
    const nodeLabelQualities = topicMap.nodes.map((node) =>
      evaluateTopicLabelQuality(node.label, { providerLabels }),
    );
    const groupLabelQualities = topicMap.groups.map((group) =>
      evaluateTopicLabelQuality(group.label, { providerLabels }),
    );
    const structureQuality = evaluateReaderSummaryTopicMapStructure(topicMap);
    const reportWithoutSecretGate = {
      schemaVersion: 1,
      artifactFormat: "reader-summary-topic-map-real-data-v1",
      collectionDate,
      generatedBy: "npm run check:reader-summary-topic-map-real-data",
      model: {
        liveNetwork: false,
        replayTarget: "workspace-reader-summary-topic-map",
        modelProvider: "deterministic-local",
        rawPostTextPersistedInReport: false,
      },
      inputs: {
        period: {
          startedAt: period.startedAt.toISOString(),
          endedAt: period.endedAt.toISOString(),
          timezone: "UTC",
        },
        maxEvidenceItems,
        maxStories,
      },
      collectionIntegrity,
      sourceData,
      replay,
      topicMap: {
        schemaVersion: topicMap.schemaVersion,
        generatedBy: topicMap.generatedBy,
        confidenceLevel: topicMap.confidence.level,
        confidenceScore: topicMap.confidence.score,
        nodeCount: topicMap.nodes.length,
        groupCount: topicMap.groups.length,
        edgeCount: topicMap.edges.length,
        warningCount: topicMap.warnings.length,
        structureQuality,
        topNodeFingerprints: topicMap.nodes.slice(0, 12).map((node) => ({
          nodeFingerprint: fingerprint(node.id),
          groupFingerprint: fingerprint(node.groupId),
          popularityScore: node.popularityScore,
          sizeWeight: node.sizeWeight,
          evidenceCount: node.evidenceCount,
          providerCount: node.providerKeys.length,
          interestCount: node.interestIds.length,
          citationCount: node.citationIds.length,
          keywordCount: node.keywords.length,
        })),
        groupFingerprints: topicMap.groups.map((group) => ({
          groupFingerprint: fingerprint(group.id),
          nodeCount: group.nodeIds.length,
          colorKey: group.colorKey,
          confidenceScore: group.confidence.score,
        })),
      },
      weakLlmFallbackProbe: {
        generatedBy: weakLlmFallbackProbe.topicMap.generatedBy,
        nodeCount: weakLlmFallbackProbe.topicMap.nodes.length,
        groupCount: weakLlmFallbackProbe.topicMap.groups.length,
        weakInputNodeLabelCount: weakLlmFallbackProbe.weakInputNodeLabelCount,
        acceptedNodeLabelCount: weakLlmFallbackProbe.acceptedNodeLabelCount,
        acceptedGroupLabelCount: weakLlmFallbackProbe.acceptedGroupLabelCount,
        rawPostTextPersistedInReport: false,
      },
      visualFixture,
      qualityGates: {},
      blockingPassed: false,
    } satisfies Report;
    const qualityGates = {
      collectionIntegrityCleanForEval:
        collectionIntegrity.status === "clean" || allowDirtyCollection,
      feedItemsAvailable: sourceData.feedItemCount > 0,
      requestCreatedJob: request.value.created === true,
      executionCompleted: execution.value.status === "completed",
      artifactPersisted: artifacts.all().length === 1,
      readyEventPublished: events.all().length === 1,
      topicMapSchemaValid:
        topicMap.schemaVersion === "reader_summary.topic_map.v1",
      topicMapGeneratedByKnownPipeline:
        topicMap.generatedBy === "deterministic" ||
        topicMap.generatedBy === "agent-runtime",
      topicMapHasNodes:
        topicMap.nodes.length >= Math.min(8, replay.storyClusterCount),
      topicMapHasMultipleGroupsWhenPossible:
        topicMap.nodes.length < 3 || topicMap.groups.length >= 2,
      topicMapEdgesMatchEvidencePolicy:
        JSON.stringify(topicMap.edges) ===
        JSON.stringify(
          buildReaderSummaryTopicMapEdges(topicMap.nodes, topicMap.groups),
        ),
      topicMapStructureIsCoherent: structureQuality.passed,
      everyNodeHasKnownGroup: topicMap.nodes.every((node) =>
        groupIds.has(node.groupId),
      ),
      everyGroupReferencesKnownNodes: topicMap.groups.every((group) =>
        group.nodeIds.every((nodeId) => nodeIds.has(nodeId)),
      ),
      everyEdgeReferencesKnownNodes: topicMap.edges.every(
        (edge) =>
          nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId),
      ),
      topicMapSizesAreBounded: topicMap.nodes.every(
        (node) =>
          node.sizeWeight >= 0 &&
          node.sizeWeight <= 1 &&
          node.popularityScore >= 0 &&
          node.popularityScore <= 100,
      ),
      topNodePopularitySorted: topicMap.nodes.every((node, index, nodes) => {
        const previous = nodes[index - 1];

        return (
          previous === undefined ||
          previous.popularityScore >= node.popularityScore
        );
      }),
      topicMapConfidenceIsCalibrated:
        topicMap.confidence.score >= 0 &&
        topicMap.confidence.score <= 1 &&
        (structureQuality.metrics.groupedCoverage >= 0.5 ||
          topicMap.confidence.level !== "high"),
      sanitizedVisualFixtureAvailable:
        visualFixture.nodes.length > 0 && visualFixture.groups.length > 0,
      topicNodeLabelsAreConcrete: nodeLabelQualities.every(
        (quality) => quality.accepted,
      ),
      topicGroupLabelsAreConcrete: topicMap.groups.every(
        (group, index) =>
          group.id === "group:ungrouped" ||
          groupLabelQualities[index]?.accepted === true,
      ),
      weakLlmFallbackProbeHasNodes:
        weakLlmFallbackProbe.topicMap.nodes.length > 0,
      weakLlmFallbackRejectsGenericNodeLabels:
        weakLlmFallbackProbe.acceptedNodeLabelCount ===
        weakLlmFallbackProbe.topicMap.nodes.length,
      weakLlmFallbackRejectsGenericGroupLabels:
        weakLlmFallbackProbe.acceptedGroupLabelCount ===
        weakLlmFallbackProbe.topicMap.groups.length,
      weakLlmFallbackDoesNotKeepWeakInputLabels:
        weakLlmFallbackProbe.topicMap.nodes.every(
          (node) => !weakLlmProbeLabels.has(normalizedProbeLabel(node.label)),
        ) &&
        weakLlmFallbackProbe.topicMap.groups.every(
          (group) => !weakLlmProbeLabels.has(normalizedProbeLabel(group.label)),
        ),
      noRawSecretFragments: noRawSecretFragments(reportWithoutSecretGate),
    };

    return {
      ...reportWithoutSecretGate,
      qualityGates,
      blockingPassed: Object.values(qualityGates).every(Boolean),
    };
  } catch (error) {
    throw new Error(
      `Reader summary topic map real-data replay failed: ${message(error)}`,
    );
  } finally {
    await connection.close().catch(() => undefined);
  }
}

function buildWeakLlmFallbackProbe(params: {
  readonly evidence: SummaryEvidenceSelection;
  readonly providerLabels: readonly string[];
}): {
  readonly topicMap: ReaderSummaryTopicMap;
  readonly weakInputNodeLabelCount: number;
  readonly acceptedNodeLabelCount: number;
  readonly acceptedGroupLabelCount: number;
} {
  const citationMap = params.evidence.selectedEvidence.map((item, index) => ({
    citationId: `weak-llm-probe-c${index + 1}`,
    feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId,
    providerKey: item.providerKey,
    field: "title" as const,
    canonicalUrl: item.canonicalUrl,
  }));
  const weakInputNodeLabels = params.evidence.clusters.map(
    (cluster, index) => ({
      nodeId: topicNodeId(cluster.id),
      topicId: `topic:${weakLlmProbeLabelAt(index)}`,
      label: weakLlmProbeLabelAt(index),
      groupId: "group:show",
      keywords: [weakLlmProbeLabelAt(index), "the", "show"],
    }),
  );
  const topicMap = buildReaderSummaryTopicMap({
    clusters: params.evidence.clusters,
    selectedEvidence: params.evidence.selectedEvidence,
    topStories: [],
    citationMap,
    labelPlan: {
      nodeLabels: weakInputNodeLabels,
      groups: [{ id: "group:show", label: "Show" }],
    },
    generatedBy: "agent-runtime",
  });
  return {
    topicMap,
    weakInputNodeLabelCount: weakInputNodeLabels.length,
    acceptedNodeLabelCount: topicMap.nodes.filter(
      (node) =>
        evaluateTopicLabelQuality(node.label, {
          providerLabels: params.providerLabels,
        }).accepted,
    ).length,
    acceptedGroupLabelCount: topicMap.groups.filter(
      (group) =>
        evaluateTopicLabelQuality(group.label, {
          providerLabels: params.providerLabels,
        }).accepted,
    ).length,
  };
}

function weakLlmProbeLabelAt(index: number): string {
  const labels = ["Why", "The", "Show", "Ask"] as const;

  return labels[index % labels.length] ?? "Why";
}

function normalizedProbeLabel(value: string): string {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function readSourceData(collectionDate: string): Promise<{
  readonly feedItemCount: number;
  readonly providerCounts: readonly ProviderCount[];
}> {
  const pool = new Pool({
    connectionString: localDatabaseUrl,
    min: 0,
    max: 1,
    connectionTimeoutMillis: 2_000,
  });

  try {
    const result = await pool.query<{
      readonly providerKey: string;
      readonly count: string;
    }>(
      `
        select provider_key::text as "providerKey", count(*)::text as "count"
        from feed_items
        where observed_at >= $1::timestamptz
          and observed_at < $2::timestamptz
        group by provider_key
        order by count(*) desc, provider_key asc
      `,
      [
        `${collectionDate}T00:00:00.000Z`,
        new Date(nextDate(collectionDate)).toISOString(),
      ],
    );
    const providerCounts = result.rows.map((row) => ({
      providerKey: row.providerKey,
      count: Number.parseInt(row.count, 10),
    }));

    return {
      feedItemCount: providerCounts.reduce(
        (total, item) => total + item.count,
        0,
      ),
      providerCounts,
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function sanitizedFixture(
  topicMap: ReaderSummaryTopicMap,
): SanitizedTopicMapFixture {
  const visibleGroups = topicMap.groups.slice(0, 8);
  const groupIdByRaw = new Map<string, string>(
    visibleGroups.map((group, index) => [group.id, `g${index + 1}`]),
  );
  const visibleNodes = topicMap.nodes
    .filter((node) => groupIdByRaw.has(node.groupId))
    .slice(0, 16);
  const nodeIdByRaw = new Map<string, string>(
    visibleNodes.map((node, index) => [node.id, `n${index + 1}`]),
  );

  return {
    groups: visibleGroups.map((group, index) => ({
      id: groupIdByRaw.get(group.id) ?? `g${index + 1}`,
      label: `Group ${index + 1}`,
      colorKey: group.colorKey,
      nodeIds: group.nodeIds
        .map((nodeId) => nodeIdByRaw.get(nodeId))
        .filter(isDefinedString),
    })),
    nodes: visibleNodes.map((node, index) => ({
      id: nodeIdByRaw.get(node.id) ?? `n${index + 1}`,
      label: `Topic ${index + 1}`,
      groupId: groupIdByRaw.get(node.groupId) ?? "g1",
      popularityScore: node.popularityScore,
      sizeWeight: node.sizeWeight,
      evidenceCount: node.evidenceCount,
    })),
    edges: topicMap.edges
      .map((edge) => ({
        sourceNodeId: nodeIdByRaw.get(edge.sourceNodeId),
        targetNodeId: nodeIdByRaw.get(edge.targetNodeId),
        weight: edge.weight,
      }))
      .filter(
        (
          edge,
        ): edge is {
          readonly sourceNodeId: string;
          readonly targetNodeId: string;
          readonly weight: number;
        } => edge.sourceNodeId !== undefined && edge.targetNodeId !== undefined,
      ),
  };
}

function isDefinedString(value: string | undefined): value is string {
  return value !== undefined;
}

function validateExistingReport(): void {
  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing and local data source is unavailable.`,
    );
  }

  const report = JSON.parse(readFileSync(outputPath, "utf8")) as Report;
  const valid =
    report.schemaVersion === 1 &&
    report.artifactFormat === "reader-summary-topic-map-real-data-v1" &&
    report.generatedBy === "npm run check:reader-summary-topic-map-real-data" &&
    report.model.liveNetwork === false &&
    report.model.rawPostTextPersistedInReport === false &&
    report.blockingPassed === true &&
    report.qualityGates.noRawSecretFragments === true &&
    noRawSecretFragments(report);

  if (!valid) {
    throw new Error(`${outputPath} failed existing artifact validation`);
  }

  console.log(
    `Reader summary topic map real-data artifact OK (${report.collectionDate})`,
  );
}

class CapturingReaderSummaryJobQueue implements ReaderSummaryJobQueuePort {
  private readonly commands: EnqueueReaderSummaryJobCommand[] = [];

  async canAccept(): Promise<boolean> {
    return true;
  }

  async enqueue(command: EnqueueReaderSummaryJobCommand): Promise<void> {
    this.commands.push(command);
  }

  all(): readonly EnqueueReaderSummaryJobCommand[] {
    return [...this.commands];
  }
}

class AllowingSummaryQuota implements SummaryQuotaPort {
  constructor(private readonly quotaClock: FixedClock) {}

  async reserveSummaryJob(): ReturnType<SummaryQuotaPort["reserveSummaryJob"]> {
    return ok({
      remaining: 999,
      resetAt: new Date(
        this.quotaClock.now().getTime() + 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
  }
}

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  constructor(private readonly prefix: string) {}

  generate(): string {
    const id = `${this.prefix}-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}
