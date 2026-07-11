import {
  READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
} from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";

export const agentRuntimeReaderSummaryTopicLabelerInstructions = [
  "You label and group Social Monitor summary topic nodes.",
  "Return JSON only. Do not invent node ids.",
  "Return exactly one nodeLabels entry for every input node. Never omit an uncertain node and never return the same nodeId twice.",
  "For each node return structured semantics: subject, claimType, optional qualifier, and confidenceScore. The application renders the final node label deterministically.",
  "Choose subject and qualifier from labelCandidates or evidenceSamples. Every significant word must be evidence-grounded.",
  "subject must be a standalone 1-3 word concrete entity, product, model, project, organization, or technical concept. qualifier is an optional 1-2 word grounded distinction.",
  "claimType must be exactly one of availability, benchmark, education, efficiency, limits, release, security, or other.",
  "Use other only when none of the seven concrete claim types applies. confidenceScore expresses confidence in subject and claimType from 0 to 1.",
  "Every group label must be a standalone 1-4 word noun phrase, never a sentence or truncated headline clause.",
  "Remove pronouns, reporting/action verbs, duplicated words, and filler. For example, prefer 'Codex CLI' over 'Codex CLI Says' and 'Grok' over 'Grok Grok Created'.",
  "For opinion-style headlines, label the concrete named product, model, organization, or technical subject; never use a sentence fragment such as 'Didn't Expect One' or 'Serious Run'. Preserve grounded model versions such as 4.5.",
  "When evidence names a product, model, person, project, or organization and the remaining words are ordinary prose, the label must include that named entity. Prefer 'Claude Scam' over 'Scam Humanity Normal', 'Anthropic Scientists' over 'Scientists Come Work', and 'Claude Adoption' over 'Often Forget Clueless'.",
  "Prefer concrete product, person, project, company, event, or technology names when the evidence supports them.",
  "Do not use generic one-word labels such as The, Why, What, How, Ask, Show, People, Users, Posts, News, Updates, Discussion, or Signal.",
  "Avoid internal UI/meta labels such as Reader Summary, Topic Labels, Topic Map, Top Reads, RSS Quality, Source Health, and provider-only labels such as Hacker News, Reddit, RSS, or X unless the evidence is explicitly about that source itself.",
  "Use the same topicId for candidates that describe the same concrete story, event, release, project, product, company, or person so they become one bubble.",
  "Do not reuse topicId merely because candidates mention the same company, model family, or ecosystem. Rollout, availability, benchmark results, cost or token efficiency, usage limits, and courses or guides are separate topics.",
  "Treat distinct model variants as distinct primary subjects. Merge variants only when every merged candidate is explicitly about one family-level announcement; label that bubble as a family rollout rather than listing variant names.",
  "Example: a model-family rollout, one variant's benchmarks, another variant's pricing, and CLI availability require separate topicIds even when they belong to one parent group and should appear near each other in the same color.",
  "Before assigning groupId, derive a single global taxonomy of 3-8 broad, mutually exclusive semantic families from all input nodes.",
  "Use groupId only for a broader parent ecosystem or domain family, never for one story, one product variant, or as the unique bubble id.",
  "Products and models that belong to the same parent organization or ecosystem must share one group even when their product names differ.",
  "For every semantic group, return 2-8 semanticAnchors copied from concrete entity, product, model, project, or domain terms in the assigned nodes. Each anchor must occur in at least two assigned nodes, and the anchors must collectively cover every assigned node.",
  "For every grouped node, include in nodeLabels.keywords at least one evidence-grounded semantic anchor shared with another node in that group. Keywords are required even when the label already contains the anchor.",
  "Do not use broad words such as AI, model, product, tool, ecosystem, industry, or technology as the only semantic anchor. If a node has no evidence-grounded shared anchor with the group, assign it to group:ungrouped.",
  "A non-neutral group must contain at least two nodes. Put uncertain, unrelated, or singleton topics in group:ungrouped instead of inventing a group.",
  "Every non-neutral groupId must start with group:, have one matching groups entry, and that entry's nodeIds must exactly match the assigned nodeLabels.",
  "Group labels must name the broad family represented by groupId, not copy a member headline.",
  "If uncertain, keep the fallback node label and use group:ungrouped.",
].join("\n");

export const buildAgentRuntimeReaderSummaryTopicLabelPrompt = (
  input: ReaderSummaryTopicLabelerInput,
  candidates: readonly ReaderSummaryTopicLabelerInput["candidates"][number][],
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
        maxGroups: READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
        minimumNodesPerSemanticGroup: 2,
        ungroupedGroupId: READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
        preserveNodeIds: true,
        sameTopicIdMergesBubble: true,
        requireNodeLabelForEveryInput: true,
        topicIdFormat: "topic:<stable-short-slug>",
        groupIdFormat: "group:<semantic-family-slug>",
        groupPolicy:
          "Choose one global taxonomy first. Prefer broad parent ecosystems or durable domains; never create a group for a single node or a product-specific subgroup when a parent ecosystem is present.",
        semanticAnchorPolicy:
          "Every semantic anchor must be evidence-grounded, shared by at least two assigned nodes, discriminative for this group, and the returned anchors must cover every assigned node. Generic AI/category words alone are insufficient.",
        labelSourcePolicy:
          "Use labelCandidates first; subject and qualifier must be evidence-grounded.",
        labelGrammar:
          "Structured subject plus claimType and optional qualifier; no pronouns, action/reporting verbs, repeated words, or truncated headline syntax.",
        claimTypes: [
          "availability",
          "benchmark",
          "education",
          "efficiency",
          "limits",
          "release",
          "security",
          "other",
        ],
        avoidGenericLabels: [
          "The",
          "Why",
          "What",
          "How",
          "Ask",
          "Show",
          "People",
          "Users",
          "Posts",
          "Updates",
          "Discussion",
          "News",
          "Signal",
        ],
      },
      period: {
        cadence: input.period.cadence,
        startedAt: input.period.startedAt.toISOString(),
        endedAt: input.period.endedAt.toISOString(),
        timezone: input.period.timezone,
      },
      nodes: candidates.map((candidate) => ({
        nodeId: candidate.nodeId,
        fallbackLabel: candidate.fallbackLabel,
        summary: candidate.summary,
        score: candidate.score,
        evidenceCount: candidate.evidenceCount,
        providerKeys: candidate.providerKeys,
        interestIds: candidate.interestIds,
        keywords: candidate.keywords,
        labelCandidates: candidate.labelCandidates.map((labelCandidate) => ({
          label: labelCandidate.label,
          source: labelCandidate.source,
          score: labelCandidate.score,
          evidenceFeedItemIds: labelCandidate.evidenceFeedItemIds,
          rationale: labelCandidate.rationale,
        })),
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

export const selectAgentRuntimeReaderSummaryTopicCandidates = (
  input: ReaderSummaryTopicLabelerInput,
  maxCandidates: number,
): readonly ReaderSummaryTopicLabelerInput["candidates"][number][] =>
  input.candidates
    .slice()
    .sort((left, right) => right.score - left.score)
    .slice(0, maxCandidates);

export const agentRuntimeReaderSummaryTopicLabelerJsonSchema = {
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
          topicId: { type: "string" },
          subject: { type: "string" },
          claimType: {
            type: "string",
            enum: [
              "availability",
              "benchmark",
              "education",
              "efficiency",
              "limits",
              "release",
              "security",
              "other",
            ],
          },
          qualifier: { type: "string" },
          confidenceScore: { type: "number", minimum: 0, maximum: 1 },
          groupId: {
            type: "string",
            pattern: "^group:[a-z0-9]+(?:-[a-z0-9]+)*$",
          },
          keywords: { type: "array", items: { type: "string" } },
          rationale: { type: "string" },
        },
        required: [
          "nodeId",
          "subject",
          "claimType",
          "confidenceScore",
          "groupId",
          "keywords",
        ],
      },
    },
    groups: {
      type: "array",
      maxItems: READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: {
            type: "string",
            pattern: "^group:[a-z0-9]+(?:-[a-z0-9]+)*$",
          },
          label: { type: "string" },
          semanticAnchors: {
            type: "array",
            minItems: 2,
            maxItems: 8,
            items: { type: "string" },
          },
          nodeIds: { type: "array", items: { type: "string" } },
          confidenceScore: { type: "number" },
          rationale: { type: "string" },
        },
        required: [
          "id",
          "label",
          "semanticAnchors",
          "nodeIds",
          "confidenceScore",
        ],
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["nodeLabels", "groups"],
} as const satisfies Record<string, unknown>;

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
