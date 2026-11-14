// Historical public entrypoint; specialist modules own independent responsibilities.
export { fallbackTopStories } from "./openai-responses-reader-summary-story-fallback-evidence";
export { immutableEditorialSlateTopStories } from "./openai-responses-reader-summary-story-fallback-slate";
export { topUpTopStories, ensureCoveragePlanStories } from "./openai-responses-reader-summary-story-fallback-coverage";
