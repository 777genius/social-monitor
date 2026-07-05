import { readerSummaryScopeKey } from "../../domain";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeProvider,
  ReaderSummaryTopicLabelerInput,
  ReaderSummaryTopicLabelerPort,
} from "../../ports";
import {
  buildAgentRuntimeRequestId,
  nonEmptyOrFallback,
  parsePositiveInteger,
  positiveIntegerOrFallback,
  readAgentRuntimeObjectOutput,
} from "./agent-runtime-model-support";
import type { ReaderSummaryTopicLabelPlan } from "../../domain";

export type AgentRuntimeReaderSummaryTopicLabelerOptions = {
  readonly client: AgentRuntimeClientPort;
  readonly agentProvider?: AgentRuntimeProvider;
  readonly providerInstanceId?: string;
  readonly model?: string;
  readonly promptVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly maxCandidates?: number;
};

const defaultAgentProvider: AgentRuntimeProvider = "codex";
const defaultModel = "agent-runtime-reader-summary-topic-labeler";
const defaultPromptVersion = "reader_summary.topic_map.agent_runtime.v1";
const defaultTimeoutMs = 90_000;
const defaultMaxOutputTokens = 4_000;
const defaultMaxCandidates = 32;

export class AgentRuntimeReaderSummaryTopicLabeler implements ReaderSummaryTopicLabelerPort {
  private readonly client: AgentRuntimeClientPort;
  private readonly agentProvider: AgentRuntimeProvider;
  private readonly providerInstanceId?: string;
  private readonly model: string;
  private readonly promptVersion: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly maxCandidates: number;

  constructor(options: AgentRuntimeReaderSummaryTopicLabelerOptions) {
    this.client = options.client;
    this.agentProvider = options.agentProvider ?? defaultAgentProvider;
    this.providerInstanceId = options.providerInstanceId;
    this.model = nonEmptyOrFallback(options.model, defaultModel);
    this.promptVersion = nonEmptyOrFallback(
      options.promptVersion,
      defaultPromptVersion,
    );
    this.timeoutMs = positiveIntegerOrFallback(
      options.timeoutMs,
      defaultTimeoutMs,
    );
    this.maxOutputTokens = positiveIntegerOrFallback(
      options.maxOutputTokens,
      defaultMaxOutputTokens,
    );
    this.maxCandidates = positiveIntegerOrFallback(
      options.maxCandidates,
      defaultMaxCandidates,
    );
  }

  async label(
    input: ReaderSummaryTopicLabelerInput,
  ): Promise<ReaderSummaryTopicLabelPlan> {
    const prompt = buildTopicLabelPrompt(input, this.maxCandidates);
    const result = await this.client.runTask({
      requestId: buildAgentRuntimeRequestId(
        "reader-summary-topic-map",
        input.tenantId,
        input.workspaceId,
        readerSummaryScopeKey(input.scope),
        input.requestedAt,
      ),
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      correlationId: buildAgentRuntimeRequestId(
        "reader-summary-topic-map-correlation",
        input.tenantId,
        input.workspaceId,
        readerSummaryScopeKey(input.scope),
        input.requestedAt,
      ),
      provider: this.agentProvider,
      providerInstanceId: this.providerInstanceId,
      purpose: "social_monitor.reader_summary.topic_map.label",
      systemPrompt: topicLabelerInstructions,
      prompt,
      outputSchema: topicLabelerJsonSchema,
      controls: {
        interactive: false,
        outputSchemaName: "social_monitor_reader_summary_topic_map_labels",
        schemaVersion: "reader_summary.topic_map.v1",
        ...runtimeModelControl(this.model, defaultModel),
        maxOutputTokens: this.maxOutputTokens,
      },
      timeoutMs: this.timeoutMs,
      metadata: {
        adapter: "agent-runtime-reader-summary-topic-labeler",
        promptVersion: this.promptVersion,
      },
    });
    const raw = readAgentRuntimeObjectOutput(
      result,
      parseTopicLabelerJsonObject,
      "Reader summary topic map",
    );

    return normalizeTopicLabelPlan(
      raw,
      new Set(input.candidates.map((c) => c.nodeId)),
    );
  }
}

export const resolveAgentRuntimeReaderSummaryTopicLabelerOptions = (
  env: NodeJS.ProcessEnv,
  client: AgentRuntimeClientPort,
): AgentRuntimeReaderSummaryTopicLabelerOptions => ({
  client,
  agentProvider: parseAgentRuntimeProvider(env.AGENT_RUNTIME_PROVIDER),
  providerInstanceId: env.AGENT_RUNTIME_PROVIDER_INSTANCE_ID,
  model: env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_MODEL,
  promptVersion: env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_PROMPT_VERSION,
  timeoutMs: parsePositiveInteger(
    env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_TIMEOUT_MS ??
      env.AGENT_RUNTIME_TIMEOUT_MS,
  ),
  maxOutputTokens: parsePositiveInteger(
    env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_MAX_OUTPUT_TOKENS,
  ),
  maxCandidates: parsePositiveInteger(
    env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_MAX_CANDIDATES,
  ),
});

const topicLabelerInstructions = [
  "You label and group Social Monitor summary topic nodes.",
  "Return JSON only. Do not invent node ids. Use concise human topic labels, not raw post titles.",
  "Prefer concrete product, person, project, company, event, or technology names when the evidence supports them.",
  "Avoid internal UI/meta labels such as Reader Summary, Topic Labels, Topic Map, Top Reads, RSS Quality, Source Health, and provider-only labels such as Hacker News, Reddit, RSS, or X unless the evidence is explicitly about that source itself.",
  "Group semantically related nodes together so nodes in the same group can share a color.",
  "If uncertain, keep the fallback label and make a conservative group.",
].join("\n");

const buildTopicLabelPrompt = (
  input: ReaderSummaryTopicLabelerInput,
  maxCandidates: number,
): string => {
  const evidenceByFeedItemId = new Map(
    input.selectedEvidence.map((item) => [item.feedItemId, item] as const),
  );
  const clusterById = new Map(
    input.clusters.map((cluster) => [cluster.id, cluster] as const),
  );

  return JSON.stringify(
    {
      task: "Label and group topic nodes for a summary bubble map.",
      constraints: {
        maxLabelWords: 4,
        maxGroups: 8,
        preserveNodeIds: true,
        avoidGenericLabels: ["Updates", "Discussion", "News", "Signal"],
      },
      period: {
        cadence: input.period.cadence,
        startedAt: input.period.startedAt.toISOString(),
        endedAt: input.period.endedAt.toISOString(),
        timezone: input.period.timezone,
      },
      nodes: input.candidates
        .slice()
        .sort((left, right) => right.score - left.score)
        .slice(0, maxCandidates)
        .map((candidate) => ({
          nodeId: candidate.nodeId,
          fallbackLabel: candidate.fallbackLabel,
          summary: candidate.summary,
          score: candidate.score,
          evidenceCount: candidate.evidenceCount,
          providerKeys: candidate.providerKeys,
          interestIds: candidate.interestIds,
          keywords: candidate.keywords,
          evidenceSamples: topicEvidenceSamples({
            candidate,
            clusterById,
            evidenceByFeedItemId,
          }),
        })),
    },
    null,
    2,
  );
};

const topicEvidenceSamples = (params: {
  readonly candidate: ReaderSummaryTopicLabelerInput["candidates"][number];
  readonly clusterById: ReadonlyMap<
    string,
    ReaderSummaryTopicLabelerInput["clusters"][number]
  >;
  readonly evidenceByFeedItemId: ReadonlyMap<
    string,
    ReaderSummaryTopicLabelerInput["selectedEvidence"][number]
  >;
}): readonly Record<string, unknown>[] => {
  const cluster = params.clusterById.get(params.candidate.storyClusterId);
  const feedItemIds = uniqueStrings([
    cluster?.representativeFeedItemId,
    ...(cluster?.duplicateFeedItemIds ?? []),
  ]);

  return feedItemIds
    .map((feedItemId) => params.evidenceByFeedItemId.get(feedItemId))
    .filter(
      (
        item,
      ): item is ReaderSummaryTopicLabelerInput["selectedEvidence"][number] =>
        item !== undefined,
    )
    .slice(0, 4)
    .map((item) => ({
      title: item.title,
      providerKey: item.providerKey,
      bodyPreview: truncatePromptText(item.bodyPreview, 320),
      whyImportant: item.whyImportant.slice(0, 2),
    }));
};

const topicLabelerJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    nodeLabels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          nodeId: { type: "string" },
          label: { type: "string" },
          groupId: { type: "string" },
          keywords: { type: "array", items: { type: "string" } },
          rationale: { type: "string" },
        },
        required: ["nodeId", "label", "groupId"],
      },
    },
    groups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          nodeIds: { type: "array", items: { type: "string" } },
          confidenceScore: { type: "number" },
          rationale: { type: "string" },
        },
        required: ["id", "label"],
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["nodeLabels", "groups"],
} as const satisfies Record<string, unknown>;

const normalizeTopicLabelPlan = (
  raw: Record<string, unknown>,
  knownNodeIds: ReadonlySet<string>,
): ReaderSummaryTopicLabelPlan => {
  const nodeLabels = readRecordArray(raw.nodeLabels)
    .map((label) => ({
      nodeId: stringValue(label.nodeId),
      label: optionalString(label.label),
      groupId: optionalString(label.groupId),
      keywords: readStringArray(label.keywords).slice(0, 8),
      rationale: optionalString(label.rationale),
    }))
    .filter((label) => knownNodeIds.has(label.nodeId));
  const groups = readRecordArray(raw.groups).map((group) => ({
    id: stringValue(group.id),
    label: stringValue(group.label),
    nodeIds: readStringArray(group.nodeIds).filter((nodeId) =>
      knownNodeIds.has(nodeId),
    ),
    confidenceScore: numberValue(group.confidenceScore),
    rationale: optionalString(group.rationale),
  }));

  return {
    nodeLabels,
    groups,
    warnings: readStringArray(raw.warnings),
  };
};

const parseTopicLabelerJsonObject = (
  value: string,
): Record<string, unknown> => {
  const parsed = JSON.parse(value);

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Reader summary topic map response must be a JSON object");
  }

  return parsed as Record<string, unknown>;
};

const readRecordArray = (value: unknown): readonly Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      )
    : [];

const readStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];

const stringValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const optionalString = (value: unknown): string | undefined => {
  const text = stringValue(value);

  return text.length > 0 ? text : undefined;
};

const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const uniqueStrings = (
  values: readonly (string | undefined)[],
): readonly string[] => [
  ...new Set(
    values
      .map((value) => value?.trim())
      .filter(
        (value): value is string => value !== undefined && value.length > 0,
      ),
  ),
];

const truncatePromptText = (
  value: string | undefined,
  maxLength: number,
): string | undefined => {
  const normalized = value?.replace(/\s+/gu, " ").trim();
  if (normalized === undefined || normalized.length === 0) {
    return undefined;
  }

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 3).trim()}...`;
};

const parseAgentRuntimeProvider = (
  value: string | undefined,
): AgentRuntimeProvider | undefined => {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  if (value === "codex" || value === "claude") {
    return value;
  }

  throw new Error('AGENT_RUNTIME_PROVIDER must be "codex" or "claude"');
};

const runtimeModelControl = (
  model: string,
  defaultModelAlias: string,
): { readonly model?: string } =>
  model === defaultModelAlias ? {} : { model };
