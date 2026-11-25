import type { ReaderSummaryModelInput } from "../../ports";

/** Publication-facing quality and caveat policy, independent of ranking and serialization. */
export const deterministicReaderSummaryPublicationAssessment = (
  input: ReaderSummaryModelInput,
  selectedEvidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"],
) => ({
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
      qualityFlags:
        selectedEvidence.length < 3 ? ["limited_sources" as const] : [],
      confidence: {
        level:
          selectedEvidence.length < 3 ? ("low" as const) : ("medium" as const),
        score: selectedEvidence.length < 3 ? 0.35 : 0.65,
        rationale:
          "Confidence is derived from selected primary evidence count in this deterministic adapter.",
      },
});
