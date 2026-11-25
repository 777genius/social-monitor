import type { ReaderSummaryCitation, ReaderSummaryNarrativeSection } from "../../domain";
import { asRecord } from "./openai-responses-reader-summary-json";
import { readDailyEditorialNarrativeCopy } from "./openai-responses-reader-summary-editorial-copy-policy";

/** Strict v2 provider section decoding; synthesis evidence binding stays in the caller. */
export const projectDailyEditorialSynthesisSection = (params: {
  readonly raw: unknown;
  readonly index: number;
  readonly plan: { readonly topics: readonly { readonly feedItemIds: readonly string[] }[] };
  readonly byCitation: ReadonlyMap<string, ReaderSummaryCitation>;
}): ReaderSummaryNarrativeSection => {
  const { index, plan, byCitation } = params;
  const raw = params.raw;
  const item = asRecord(raw);
  const expectedKind = index === 0 ? "lead" : "secondary_signal";
  const citations = item?.citationIds;
  if (item === null || item.kind !== expectedKind) {
    throw new Error("Daily editorial narrative has invalid section order");
  }
  if (item.storyClusterId !== null && item.storyClusterId !== undefined) {
    throw new Error("Daily editorial narrative has a story cluster on a synthesis section");
  }
  if (!Array.isArray(citations) || citations.length < 1 || citations.length > 3 ||
      new Set(citations).size !== citations.length ||
      citations.some(id => typeof id !== "string" ||
        !plan.topics.some(topic => topic.feedItemIds.includes(byCitation.get(id)?.feedItemId ?? "")))) {
    throw new Error("Daily editorial narrative has unplanned or duplicate citations");
  }
  const { title, text } = readDailyEditorialNarrativeCopy(item);
  return {
    id: `narrative-${index + 1}`, kind: expectedKind, title, text,
    citationIds: [...citations] as string[],
  };
};
