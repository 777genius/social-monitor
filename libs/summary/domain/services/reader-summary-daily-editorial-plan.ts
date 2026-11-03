import type { ReaderSummaryDailyGenerationInput } from "../value-objects/reader-summary-daily-generation-input";
import type { SummaryEvidenceSelection } from "../value-objects/summary-evidence-item";
import type { ReaderSummaryCoveragePlan, ReaderSummaryCoveragePlanItem } from "./reader-summary-coverage-plan";
import type { ReaderSummaryCitation } from "../entities/citation";
import type { ReaderSummaryTopStory } from "../entities/reader-summary-artifact";
import type { ReaderSummaryNarrativeSection } from "../entities/reader-summary-narrative-section";

export const READER_SUMMARY_DAILY_EDITORIAL_VERSION = "reader_summary.daily_editorial.v1" as const;
export const READER_SUMMARY_DAILY_EDITORIAL_PROMPT_VERSION =
  "reader_summary.prompt.2026-11-03.daily_editorial.v1" as const;

export type ReaderSummaryDailyEditorialTopic = {
  readonly title: string;
  readonly why: string;
  readonly depth: "detailed" | "brief";
  readonly feedItemIds: readonly string[];
};
export type ReaderSummaryDailyEditorialPlan = {
  readonly version: typeof READER_SUMMARY_DAILY_EDITORIAL_VERSION;
  readonly topics: readonly ReaderSummaryDailyEditorialTopic[];
};
export type ReaderSummaryDailyEditorialReceipt = {
  readonly requestSha256: string;
  readonly outputSha256: string;
};
export type ReaderSummaryDailyEditorialProof = {
  readonly plan: ReaderSummaryDailyEditorialPlan;
  readonly inputSha256: string;
  readonly editor: ReaderSummaryDailyEditorialReceipt;
  readonly writerPlanSha256: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Validate the model proposal against the actual frozen 1–30 inputs, not a ranked slate. */
export const readReaderSummaryDailyEditorialPlan = (
  value: unknown,
  input: ReaderSummaryDailyGenerationInput,
): ReaderSummaryDailyEditorialPlan => {
  if (!isRecord(value) || value.version !== READER_SUMMARY_DAILY_EDITORIAL_VERSION ||
      !Array.isArray(value.topics) || value.topics.length < 1 || value.topics.length > 10 ||
      Object.keys(value).length !== 2) {
    throw new Error("Daily editorial plan must contain one to ten topics");
  }
  const known = new Map(input.selected.map(item => [item.feedItemId, item] as const));
  const assigned = new Set<string>(), anchors = new Set<string>();
  const topics = value.topics.map((topic: unknown, index: number): ReaderSummaryDailyEditorialTopic => {
    if (!isRecord(topic) || Object.keys(topic).length !== 4 ||
        typeof topic.title !== "string" || !topic.title.trim() || topic.title.length > 180 ||
        typeof topic.why !== "string" || !topic.why.trim() || topic.why.length > 320 ||
        (topic.depth !== "detailed" && topic.depth !== "brief") ||
        (index === 0 && topic.depth !== "detailed") ||
        !Array.isArray(topic.feedItemIds) ||
        topic.feedItemIds.length === 0 || topic.feedItemIds.length > input.selected.length) {
      throw new Error("Daily editorial topic fields are invalid");
    }
    const ids: string[] = [];
    for (const id of topic.feedItemIds) {
      if (typeof id !== "string" || !known.has(id) || assigned.has(id)) {
        throw new Error("Daily editorial plan references unknown or duplicated source");
      }
      assigned.add(id);
      ids.push(id);
    }
    const anchor = known.get(ids[0]!)!.storyId;
    if (anchors.has(anchor)) throw new Error("Daily editorial plan repeats a story anchor");
    anchors.add(anchor);
    return { title: topic.title.trim(), why: topic.why.trim(),
      depth: topic.depth, feedItemIds: ids };
  });
  return { version: READER_SUMMARY_DAILY_EDITORIAL_VERSION, topics };
};

export const readerSummaryDailyEditorialCoveragePlan = (
  evidence: SummaryEvidenceSelection,
  plan: ReaderSummaryDailyEditorialPlan,
): ReaderSummaryCoveragePlan => {
  const frozen = evidence.dailyGenerationInput;
  if (frozen === undefined) throw new Error("Daily editorial coverage requires frozen input");
  readReaderSummaryDailyEditorialPlan(plan, frozen);
  const selected = new Map(frozen.selected.map(item => [item.feedItemId, item] as const));
  const candidates = new Map(evidence.selectedEvidence.map(item => [item.feedItemId, item] as const));
  const clusters = new Map(evidence.clusters.map(item => [item.id, item] as const));
  const items = plan.topics.map((topic, index): ReaderSummaryCoveragePlanItem => {
    const anchorId = selected.get(topic.feedItemIds[0]!)!.storyId;
    const cluster = clusters.get(anchorId);
    const sources = topic.feedItemIds.map(id => candidates.get(id));
    if (cluster === undefined || sources.some(source => source === undefined)) {
      throw new Error("Daily editorial plan source is missing from frozen evidence");
    }
    return {
      role: index === 0 ? "lead" : "secondary", clusterId: anchorId,
      score: cluster.score, feedItemIds: topic.feedItemIds,
      providerKeys: [...new Set(sources.map(source => source!.providerKey))],
      interestIds: [...new Set(sources.map(source => source!.interestId))],
      whyImportant: [topic.why],
    };
  });
  // A topical lead must not be forced to cite an unrelated second event.
  return { mode: "single_story", lead: items[0], secondary: items.slice(1) };
};

/** No normalizer may silently drop/reorder topics or borrow a different topic's citations. */
export const assertReaderSummaryDailyEditorialArticle = (params: {
  readonly proof: ReaderSummaryDailyEditorialProof;
  readonly input: ReaderSummaryDailyGenerationInput;
  readonly stories: readonly ReaderSummaryTopStory[];
  readonly sections: readonly ReaderSummaryNarrativeSection[];
  readonly citations: readonly ReaderSummaryCitation[];
}): void => {
  const plan = readReaderSummaryDailyEditorialPlan(params.proof.plan, params.input);
  const byFeed = new Map(params.input.selected.map(item => [item.feedItemId, item] as const));
  const citations = new Map(params.citations.map(item => [item.citationId, item] as const));
  // GitHub Trending is a separate existing appendix, never an ordinary planned topic.
  const ordinary = params.sections.filter(section => section.id !== "github-trending");
  if (ordinary.length !== plan.topics.length || params.stories.length !== plan.topics.length) {
    throw new Error("Daily editorial article does not cover every planned topic");
  }
  for (const [index, topic] of plan.topics.entries()) {
    const anchor = byFeed.get(topic.feedItemIds[0]!)!.storyId;
    const section = ordinary[index]!, story = params.stories[index]!;
    if (section.kind !== (index === 0 ? "lead" : "secondary_signal") ||
        section.storyClusterId !== anchor || story.storyClusterId !== anchor) {
      throw new Error("Daily editorial article changes topic order or anchor");
    }
    const allowed = new Set(topic.feedItemIds);
    for (const ids of [section.citationIds, story.citationIds]) {
      if (ids.length < 1 || ids.some(id => {
        const citation = citations.get(id);
        return citation === undefined || !allowed.has(citation.feedItemId);
      })) throw new Error("Daily editorial article has an out-of-topic citation");
    }
  }
};
