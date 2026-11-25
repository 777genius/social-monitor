import { buildReaderSummary } from "../../domain";
import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelInput,
  ReaderSummaryModelRoute,
} from "../../ports";
import { buildReaderSummaryEvidenceCitationMap } from "./reader-summary-evidence-citation-map";

/** Deliberately separate empty-primary-evidence publication from story selection. */
export const buildDeterministicNoSignalReaderSummaryAttempt = (params: {
  readonly input: ReaderSummaryModelInput;
  readonly selectedRoute: ReaderSummaryModelRoute;
  readonly lineage: ProviderReaderSummaryAttempt["draft"]["lineage"];
  readonly usage: ReaderSummaryModelEstimate;
}): ProviderReaderSummaryAttempt => {
  const { input, selectedRoute, lineage, usage } = params;
  const noSignalDraft = {
    headline: "No reliable workspace signal yet",
    executiveSummary:
      "No eligible feed items were available for this summary window.",
    topStories: [],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [
      {
        description:
          "The summary window did not contain enough primary evidence to produce claims.",
        reason: "insufficient_evidence" as const,
      },
    ],
    citationMap: buildReaderSummaryEvidenceCitationMap(
      input.evidence.selectedEvidence,
    ),
    qualityFlags: ["no_signal", "limited_sources"] as const,
    confidence: {
      level: "none" as const,
      score: 0,
      rationale: "No primary evidence was selected for the summary window.",
    },
    lineage,
    usage,
    noSignalReason:
      "No eligible evidence items selected for this summary scope.",
  };

  return {
    route: selectedRoute,
    draft: {
      ...noSignalDraft,
      content: buildReaderSummary({
        ...noSignalDraft,
        storyClusters: input.evidence.clusters,
        sourceWindow: input.evidence.sourceWindow,
        selectedEvidence: input.evidence.selectedEvidence,
        editorialSlate: input.evidence.editorialSlate,
      }),
    },
  };
};
