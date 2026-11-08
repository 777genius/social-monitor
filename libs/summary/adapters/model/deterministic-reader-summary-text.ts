import type { ReaderSummaryModelInput } from "../../ports";

export const buildExecutiveSummary = (input: ReaderSummaryModelInput): string => {
  const formatLabel = summaryFormatLabel(input.policy.format);
  const toneLabel = input.policy.tone;
  const scopeLabel =
    input.scope.type === "workspace"
      ? "workspace"
      : `interest ${input.scope.interestId}`;
  const repeatedCount = input.evidence.clusters.filter(
    (cluster) => cluster.interestIds.length >= 2,
  ).length;
  const storyCount = input.evidence.selectedEvidence.length;
  const base = `Current ${formatLabel} covers ${storyCount} selected ${storyCount === 1 ? "story" : "stories"} for ${scopeLabel} in ${articleFor(toneLabel)} ${toneLabel} tone.`;
  const repeated =
    repeatedCount === 0
      ? "No repeated cross-interest signals were detected."
      : `${repeatedCount} repeated cross-interest ${repeatedCount === 1 ? "signal was" : "signals were"} detected.`;

  if (input.policy.customInstructions === undefined) {
    return `${base} ${repeated}`;
  }

  return `${base} ${repeated} Custom focus: ${input.policy.customInstructions}`;
};

const summaryFormatLabel = (format: string): string => {
  if (format === "executive_brief") {
    return "executive summary";
  }
  const label = format.split("_").join(" ");
  return label.includes("summary") ? label : `${label} summary`;
};

const articleFor = (word: string): "a" | "an" =>
  /^[aeiou]/i.test(word) ? "an" : "a";
