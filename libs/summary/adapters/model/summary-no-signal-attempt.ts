import type {
  ProviderSummaryAttempt,
  SummaryModelEstimate,
  SummaryModelInput,
  SummaryModelRoute,
} from "../../ports";
import { buildOpenAiSummaryLineage } from "./openai-responses-summary-draft-normalizer";

export const buildSummaryNoSignalAttempt = (params: Readonly<{
  input: SummaryModelInput;
  selectedRoute: SummaryModelRoute;
  evalDatasetVersion: string;
  usage: SummaryModelEstimate;
}>): ProviderSummaryAttempt => {
  const { input, selectedRoute } = params;
  return {
    route: selectedRoute,
    draft: {
      headline: "No reliable signal yet",
      executiveSummary:
        "No eligible evidence items were available for this interest window.",
      keyPoints: [],
      risksAndUnknowns: [
        {
          description:
            "The summary window did not contain enough source material to produce claims.",
          reason: "insufficient_evidence",
        },
      ],
      sourceHighlights: [],
      citationMap: [],
      qualityFlags: ["no_signal", "limited_sources"],
      confidence: {
        level: "none",
        score: 0,
        rationale: "No evidence was selected for the summary window.",
      },
      lineage: buildOpenAiSummaryLineage(
        input,
        selectedRoute,
        params.evalDatasetVersion,
      ),
      usage: params.usage,
      noSignalReason: "No eligible evidence items selected for this interest.",
    },
  };
};
