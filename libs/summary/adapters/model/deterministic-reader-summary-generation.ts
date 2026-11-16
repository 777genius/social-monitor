import { primaryReaderSummaryEvidence } from "../../domain";
import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelInput,
  ReaderSummaryModelRoute,
} from "../../ports";
import { buildDeterministicNoSignalReaderSummaryAttempt } from "./deterministic-reader-summary-no-signal";
import { selectDeterministicReaderSummaryCoverage } from "./deterministic-reader-summary-coverage-selection";
import { buildDeterministicReaderSummaryStoryProjection } from "./deterministic-reader-summary-story-projection";
import { buildDeterministicReaderSummaryDocument } from "./deterministic-reader-summary-document";

/** Evidence-to-publication policy. The adapter owns routing/budget/error translation,
 * while this pure projection owns trusted fallback, citations and draft assembly.
 */
export const projectDeterministicReaderSummaryAttempt = ({
  input, selectedRoute, usage,
}: {
  readonly input: ReaderSummaryModelInput;
  readonly selectedRoute: ReaderSummaryModelRoute;
  readonly usage: ReaderSummaryModelEstimate;
}): ProviderReaderSummaryAttempt => {
    const lineage = {
      promptVersion: selectedRoute.promptVersion,
      schemaVersion: selectedRoute.schemaVersion,
      modelVersion: selectedRoute.model,
      providerVersion: selectedRoute.provider,
      rulesVersion: input.policy.rulesVersion,
      evalDatasetVersion: "reader_summary.eval.mvp.v1",
      rankingPolicyVersion: input.evidence.rankingPolicyVersion,
    } as const;
    const primaryEvidence = primaryReaderSummaryEvidence(input.evidence);
    const firstItem = primaryEvidence.selectedEvidence[0];

    if (firstItem === undefined) {
      return buildDeterministicNoSignalReaderSummaryAttempt({
        input,
        selectedRoute,
        lineage,
        usage,
      });
    }

    const citedEvidence = input.evidence.selectedEvidence;
    const { selectedEvidence, topStoryClusters } =
      selectDeterministicReaderSummaryCoverage(input, primaryEvidence);
    const projection =
      buildDeterministicReaderSummaryStoryProjection({
        input,
        citedEvidence,
        selectedEvidence,
        topStoryClusters,
        firstItem,
      });

    return buildDeterministicReaderSummaryDocument({
      input,
      selectedRoute,
      selectedEvidence,
      citedEvidence,
      projection,
      lineage,
      usage,
    });
};
