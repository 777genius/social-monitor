import type { ReaderSummaryModelInput } from "../../ports";
import {
  selectClustersForEvidence,
  selectProviderDiverseRankedEvidence,
} from "./deterministic-reader-summary-evidence-selection";

// A materialized editorial slate is already trusted presentation order.
// Only unslated fallback is eligible for local diversity and coverage pinning.
export const selectDeterministicReaderSummaryCoverage = (
  input: ReaderSummaryModelInput,
  primaryEvidence: Pick<ReaderSummaryModelInput["evidence"], "selectedEvidence" | "clusters">,
): {
  readonly selectedEvidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"];
  readonly topStoryClusters: ReaderSummaryModelInput["evidence"]["clusters"];
} => {
  const selectedEvidence = input.evidence.editorialSlate === undefined
    ? selectProviderDiverseRankedEvidence(
        primaryEvidence.selectedEvidence,
        input.policy.maxStories,
      )
    : primaryEvidence.selectedEvidence;
  const topStoryClusters = input.evidence.editorialSlate === undefined
    ? selectClustersForEvidence(
        input.evidence.clusters,
        selectedEvidence,
        input.policy.maxStories,
        [
          ...(input.coveragePlan.lead === undefined
            ? []
            : [input.coveragePlan.lead.clusterId]),
          ...input.coveragePlan.secondary.map((item) => item.clusterId),
        ],
      )
    : primaryEvidence.clusters;
  return { selectedEvidence, topStoryClusters };
};
