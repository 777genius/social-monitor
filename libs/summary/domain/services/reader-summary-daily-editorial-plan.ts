import type { ReaderSummaryDailyGenerationInput } from "../value-objects/reader-summary-daily-generation-input";

export const DAILY_EDITORIAL_PLAN_VERSION = "reader_summary.daily_editorial.v1" as const;

export type DailyEditorialTopic = {
  readonly title: string;
  readonly why: string;
  readonly depth: "detailed" | "brief";
  readonly feedItemIds: readonly string[];
};

export type DailyEditorialPlan = {
  readonly version: typeof DAILY_EDITORIAL_PLAN_VERSION;
  readonly topics: readonly DailyEditorialTopic[];
};

/** Source IDs are authority, not model-authored story IDs. */
export function validateDailyEditorialPlan(
  value: unknown,
  frozen: ReaderSummaryDailyGenerationInput,
): DailyEditorialPlan {
  if (!record(value) || value.version !== DAILY_EDITORIAL_PLAN_VERSION ||
      Object.keys(value).length !== 2 || !Array.isArray(value.topics) ||
      value.topics.length < 1 || value.topics.length > 10 ||
      frozen.selected.length < 1) {
    throw new Error("Invalid daily editorial plan");
  }
  const selected = new Set(frozen.selected.map(item => item.feedItemId));
  const used = new Set<string>();
  const anchors = new Set<string>();
  const byId = new Map(frozen.selected.map(item => [item.feedItemId, item.storyId] as const));
  const topics = value.topics.map((candidate, index): DailyEditorialTopic => {
    if (!record(candidate) || Object.keys(candidate).length !== 4 ||
        !text(candidate.title, 180) || !text(candidate.why, 400) ||
        (candidate.depth !== "detailed" && candidate.depth !== "brief") ||
        (index === 0 && candidate.depth !== "detailed") ||
        !Array.isArray(candidate.feedItemIds) ||
        candidate.feedItemIds.length < 1 ||
        candidate.feedItemIds.length > frozen.selected.length) {
      throw new Error("Invalid daily editorial topic");
    }
    const ids: string[] = [];
    for (const item of candidate.feedItemIds) {
      if (typeof item !== "string" || !selected.has(item) || used.has(item)) {
        throw new Error("Daily editorial topic references unknown or duplicate source");
      }
      used.add(item);
      ids.push(item);
    }
    const anchor = byId.get(ids[0]!);
    if (anchor === undefined || anchors.has(anchor)) {
      throw new Error("Duplicate daily editorial topic anchor");
    }
    anchors.add(anchor);
    return {
      title: candidate.title.trim(),
      why: candidate.why.trim(),
      depth: candidate.depth,
      feedItemIds: ids,
    };
  });
  return { version: DAILY_EDITORIAL_PLAN_VERSION, topics };
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, limit: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= limit;
