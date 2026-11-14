import type {
  ReaderSummaryCoveragePlanItem,
  ReaderSummaryNarrativeSection,
} from "../../domain";
import type { ProviderReaderSummaryAttempt } from "../../ports";
import { uniqueNarrativeCitationIds } from "./deterministic-reader-summary-citation-selection";

type DraftCitation = ProviderReaderSummaryAttempt["draft"]["citationMap"][number];
type DraftTopStory = ProviderReaderSummaryAttempt["draft"]["topStories"][number];

/** The composer owns lead planning; this owner renders grounded secondary copy. */
export const buildDeterministicReaderSecondarySections = (
  secondary: readonly ReaderSummaryCoveragePlanItem[],
  topStoryByClusterId: ReadonlyMap<string, DraftTopStory>,
  dailySynthesisCitations: ReadonlyMap<string, DraftCitation>,
): readonly ReaderSummaryNarrativeSection[] =>
  secondary.map(
    (item, index): ReaderSummaryNarrativeSection => {
      const story = topStoryByClusterId.get(item.clusterId);
      return {
        id: `narrative-deterministic-secondary-${index + 1}`,
        kind: "secondary_signal",
        title: story?.title ?? `Additional monitored signal ${index + 1}`,
        text:
          story?.summary ??
          item.whyImportant[0] ??
          "A distinct monitored signal also appeared in this window.",
        citationIds: uniqueNarrativeCitationIds([
          dailySynthesisCitations.get(item.clusterId)?.citationId,
        ]),
        storyClusterId: item.clusterId,
      };
    },
  );
