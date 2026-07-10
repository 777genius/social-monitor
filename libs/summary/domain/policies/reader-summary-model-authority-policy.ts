export type ReaderSummaryModelAuthority =
  "subscription_runtime" | "direct_model_api" | "deterministic";

export const readerSummaryModelAuthority = (
  modelVersion: string,
): ReaderSummaryModelAuthority => {
  const normalized = modelVersion.trim().toLowerCase();
  if (
    normalized.startsWith("codex:") ||
    normalized.startsWith("claude:") ||
    normalized.includes("agent-runtime")
  ) {
    return "subscription_runtime";
  }
  if (normalized.includes("deterministic")) {
    return "deterministic";
  }

  return "direct_model_api";
};

export const canReaderSummaryModelSupersede = (
  incomingModelVersion: string,
  visibleModelVersion: string,
): boolean =>
  authorityRank(readerSummaryModelAuthority(incomingModelVersion)) >=
  authorityRank(readerSummaryModelAuthority(visibleModelVersion));

const authorityRank = (authority: ReaderSummaryModelAuthority): number => {
  switch (authority) {
    case "subscription_runtime":
      return 3;
    case "direct_model_api":
      return 2;
    case "deterministic":
      return 1;
  }
};
