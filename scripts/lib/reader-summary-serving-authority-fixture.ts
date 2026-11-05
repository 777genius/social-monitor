import type { ReaderSummaryServingAuthority } from "./reader-summary-serving-authority";

export const fixtureReaderSummaryServingAuthority = async (): Promise<
  ReaderSummaryServingAuthority
> => Object.freeze({
  summaryGenerator: {
    mode: "agent-runtime",
    provider: "codex",
    physicalModel: "gpt-5.6-sol",
    reasoningPolicy: "xhigh",
  },
  topicLabeler: {
    mode: "deterministic",
    provider: "deterministic",
    physicalModel: "deterministic-reader-summary-topic-labeler-v1",
    reasoningPolicy: "not-applicable",
  },
  topicRelationVerifier: {
    mode: "deterministic",
    provider: "deterministic",
    physicalModel: "deterministic-reader-summary-topic-relation-verifier-v1",
    reasoningPolicy: "not-applicable",
  },
  storyRelationVerifier: {
    mode: "agent-runtime",
    provider: "codex",
    physicalModel: "gpt-5.6-sol",
    reasoningPolicy: "high",
  },
  runtime: {
    engine: "subscription-runtime-cli",
    packageVersion: "0.0.0-test",
    launcherSha256: "a".repeat(64),
  },
});
