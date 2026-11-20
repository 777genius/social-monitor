import type { ReaderSummaryCitation, ReaderSummaryTopStory } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { uniqueNonEmptyStrings } from "./openai-responses-reader-summary-json";
import {
  completeClusterCitationCoverage,
  providerKeysCoveredByCitations,
} from "./openai-responses-reader-summary-citation-coverage";

type StoryCluster = ReaderSummaryModelInput["evidence"]["clusters"][number];

// The caller admits untrusted cluster identity and citations first.
// Project only evidence-backed providers with the unchanged citation cap.
export const projectTrustedModelStoryCitations = (
  story: ReaderSummaryTopStory,
  storyClusterId: string,
  cluster: StoryCluster,
  citationIds: readonly string[],
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
): ReaderSummaryTopStory | undefined => {
  const providerKeys = uniqueNonEmptyStrings([
    ...story.providerKeys,
    ...cluster.providerKeys,
  ]);
  const completedCitationIds = completeClusterCitationCoverage({
    citationIds,
    providerKeys,
    cluster,
    citationById,
  });
  if (completedCitationIds.length === 0) {
    return undefined;
  }

  return {
    ...story,
    storyClusterId,
    interestIds: uniqueNonEmptyStrings([
      ...story.interestIds,
      ...cluster.interestIds,
    ]),
    providerKeys: providerKeysCoveredByCitations(
      providerKeys,
      completedCitationIds,
      citationById,
    ),
    citationIds: completedCitationIds,
  };
};
