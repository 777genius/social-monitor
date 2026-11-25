import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelInput,
  ReaderSummaryModelRoute,
} from "../../ports";
import { buildReaderSummary } from "../../domain";
import { buildReaderHeadline } from "./deterministic-reader-summary-headline";
import { selectDeterministicReaderSummaryHeadlineEvidence } from "./deterministic-reader-summary-headline-evidence";
import { deterministicReaderSummaryPublicationAssessment } from "./deterministic-reader-summary-publication-assessment";
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
    const headlineEvidence = selectDeterministicReaderSummaryHeadlineEvidence(input, selectedEvidence);
    const headline = buildReaderHeadline(input, headlineEvidence);
    const executiveSummary = buildExecutiveSummary(input);
    const narrativeSections = buildDeterministicReaderSummaryNarrative({
      input,
      executiveSummary,
      citationMap,
      topStories,
    });
    const assessment = deterministicReaderSummaryPublicationAssessment(input, selectedEvidence);
    const draft = {
      headline,
      executiveSummary,
      topStories,
      interestHighlights,
      repeatedSignals,
      risksAndUnknowns: assessment.risksAndUnknowns,
      citationMap,
      qualityFlags: assessment.qualityFlags,
      confidence: assessment.confidence,
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
