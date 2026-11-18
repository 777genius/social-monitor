// Keep both historical entrypoints intact; pure verifier admission does not
// depend on reading process environment or on the runtime adapter facade.
export {
  resolveStoryRelationVerifierConfig,
  type AgentRuntimeReaderSummaryStoryRelationVerifierOptions,
} from "./agent-runtime-reader-summary-story-relation-config";
export { resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions } from "./agent-runtime-reader-summary-story-relation-env-options";
