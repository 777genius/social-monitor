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
  void input;
  const storyCount = selectedEvidence.length;
  const providerLabels = uniqueStrings(selectedEvidence.map(providerLabel));

  if (storyCount === 0 || providerLabels.length === 0) {
    return "No reliable monitored signal yet";
  }

  const storyLabel = storyCount === 1 ? "story" : "stories";
  const verb = storyCount === 1 ? "emerges" : "emerge";

  return `${storyCount} monitored ${storyLabel} ${verb} across ${summarizeProviderLabels(providerLabels)}`;
};

const providerLabel = (
  evidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"][number],
): string => evidence.providerName ?? providerKeyLabel(evidence.providerKey);
