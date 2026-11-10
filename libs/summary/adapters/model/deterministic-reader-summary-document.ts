import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelInput,
  ReaderSummaryModelRoute,
} from "../../ports";
import { buildReaderSummary } from "../../domain";
import { buildReaderHeadline } from "./deterministic-reader-summary-headline";
import { buildDeterministicReaderSummaryNarrative } from "./deterministic-reader-summary-narrative";
import { buildExecutiveSummary } from "./deterministic-reader-summary-text";
import type { buildDeterministicReaderSummaryStoryProjection } from "./deterministic-reader-summary-story-projection";

/** Compose the deterministic publication document from an already selected evidence set.
 * Routing, budgets, provider diversity and no-signal dispatch remain in the adapter.
 */
export const buildDeterministicReaderSummaryDocument = ({
  input,
  selectedRoute,
  selectedEvidence,
  citedEvidence,
  projection,
  lineage,
  usage,
}: {
  readonly input: ReaderSummaryModelInput;
  readonly selectedRoute: ReaderSummaryModelRoute;
  readonly selectedEvidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"];
  readonly citedEvidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"];
  readonly projection: ReturnType<typeof buildDeterministicReaderSummaryStoryProjection>;
  readonly lineage: ProviderReaderSummaryAttempt["draft"]["lineage"];
  readonly usage: ProviderReaderSummaryAttempt["draft"]["usage"];
}): ProviderReaderSummaryAttempt => {
  const { citationMap, topStories, interestHighlights, repeatedSignals } = projection;
    const headlineEvidence = input.evidence.editorialSlate === undefined
      ? selectedEvidence
      : input.evidence.editorialSlate.orderedCandidateIds.flatMap(
          (candidateId) => {
            const item = input.evidence.selectedEvidence.find(
              (evidence) => evidence.feedItemId === candidateId,
            );
            return item === undefined ? [] : [item];
          },
        );
    const headline = buildReaderHeadline(input, headlineEvidence);
    const executiveSummary = buildExecutiveSummary(input);
    const narrativeSections = buildDeterministicReaderSummaryNarrative({
      input,
      executiveSummary,
      citationMap,
      topStories,
    });
    const draft = {
      headline,
      executiveSummary,
      topStories,
      interestHighlights,
      repeatedSignals,
      risksAndUnknowns: input.policy.includeRisks
        ? [
            {
              description:
                "This deterministic reader summary only uses selected primary evidence titles.",
              citationIds: ["c1"],
              reason: "source_limit" as const,
            },
          ]
        : [],
      citationMap,
      qualityFlags:
        selectedEvidence.length < 3 ? ["limited_sources" as const] : [],
      confidence: {
        level:
          selectedEvidence.length < 3 ? ("low" as const) : ("medium" as const),
        score: selectedEvidence.length < 3 ? 0.35 : 0.65,
        rationale:
          "Confidence is derived from selected primary evidence count in this deterministic adapter.",
      },
      lineage,
      usage,
    };

    const content = buildReaderSummary({
      ...draft,
      narrativeSections,
      storyClusters: input.evidence.clusters,
      sourceWindow: input.evidence.sourceWindow,
      selectedEvidence: citedEvidence,
      editorialSlate: input.evidence.editorialSlate,
    });

    return {
      route: selectedRoute,
      draft: {
        ...draft,
        headline: content.headline,
        content,
      },
    };
};
