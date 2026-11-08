import { buildReaderSummary } from "../../domain";
import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelInput,
  ReaderSummaryModelRoute,
} from "../../ports";
import { buildOpenAiReaderSummaryLineage } from "./openai-responses-reader-summary-draft-normalizer";
import { buildReaderSummaryEvidenceCitationMap } from "./reader-summary-evidence-citation-map";

export const buildReaderSummaryNoSignalAttempt = (params: Readonly<{
  input: ReaderSummaryModelInput;
  selectedRoute: ReaderSummaryModelRoute;
  evalDatasetVersion: string;
  usage: ReaderSummaryModelEstimate;
}>): ProviderReaderSummaryAttempt => {
  const { input, selectedRoute } = params;
    const citationMap = buildReaderSummaryEvidenceCitationMap(
      input.evidence.selectedEvidence,
    );
    const noSignalDraft = {
      headline: "No reliable workspace signal yet",
      executiveSummary:
        "No eligible evidence items were available for this summary window.",
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
      citationMap,
      qualityFlags: ["no_signal", "limited_sources"] as const,
      confidence: {
        level: "none" as const,
        score: 0,
        rationale: "No primary evidence was selected for the summary window.",
      },
      lineage: buildOpenAiReaderSummaryLineage(
        input,
        selectedRoute,
        params.evalDatasetVersion,
      ),
      usage: params.usage,
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
