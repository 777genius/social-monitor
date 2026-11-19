import { LLM_DEFAULT_OUTPUT_BYTES, LLM_MAX_OUTPUT_BYTES } from "@agent-teams/account-gateway/llm";

import { activeReaderSummaryPurposes } from "../active-reader-summary-generation-profile";

/** Raw SSE includes reasoning and event envelopes, independently of the decoded JSON schema. */
export const gatewayLlmOutputBytes = (purpose: string): number =>
  purpose === activeReaderSummaryPurposes.generate || purpose === activeReaderSummaryPurposes.repair
    ? LLM_MAX_OUTPUT_BYTES
    : LLM_DEFAULT_OUTPUT_BYTES;

/** One output-token admission for both SDK dispatch and the attested request digest. */
export const gatewayLlmMaxOutputTokens = (minOutputTokens: number, requested: unknown): number =>
  Math.max(minOutputTokens,
    typeof requested === "number" && Number.isSafeInteger(requested) && requested > 0
      ? requested : 0);
