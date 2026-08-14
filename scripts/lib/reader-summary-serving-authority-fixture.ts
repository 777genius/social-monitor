import type { ReaderSummaryServingAuthority } from "./reader-summary-serving-authority";

export const fixtureReaderSummaryServingAuthority = async (): Promise<
  ReaderSummaryServingAuthority
> => Object.freeze({
  summaryModelMode: "agent-runtime",
  topicLabelerMode: "deterministic",
  provider: "codex",
  physicalModel: "gpt-5.6-sol",
  reasoningEffort: "xhigh",
  runtimeEngine: "subscription-runtime-cli",
  runtimePackageVersion: "0.0.0-test",
  launcherSha256: "a".repeat(64),
});
