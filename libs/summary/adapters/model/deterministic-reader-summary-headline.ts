import type { ReaderSummaryModelInput } from "../../ports";
import {
  providerKeyLabel,
  summarizeProviderLabels,
  uniqueStrings,
} from "./summary-provider-labels";

export const buildReaderHeadline = (
  input: ReaderSummaryModelInput,
  selectedEvidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"],
): string => {
  const scopeLabel = input.scope.type === "workspace" ? "Workspace" : "Topic";
  const storyCount = selectedEvidence.length;
  const providerLabels = uniqueStrings(selectedEvidence.map(providerLabel));

  if (storyCount === 0 || providerLabels.length === 0) {
    return `${scopeLabel} briefing`;
  }

  const storyLabel = storyCount === 1 ? "story" : "stories";
  const sourceLabel = providerLabels.length === 1 ? "source" : "sources";

  return `${scopeLabel} briefing: ${storyCount} ${storyLabel} across ${providerLabels.length} ${sourceLabel} (${summarizeProviderLabels(providerLabels)})`;
};

const providerLabel = (
  evidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"][number],
): string => evidence.providerName ?? providerKeyLabel(evidence.providerKey);
