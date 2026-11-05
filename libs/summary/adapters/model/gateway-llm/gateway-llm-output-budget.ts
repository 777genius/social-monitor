import { LLM_DEFAULT_OUTPUT_BYTES, LLM_MAX_OUTPUT_BYTES } from "@agent-teams/account-gateway/llm";

import { activeReaderSummaryPurposes } from "../active-reader-summary-generation-profile";

/** Raw SSE includes reasoning and event envelopes, independently of the decoded JSON schema. */
export const gatewayLlmOutputBytes = (purpose: string): number =>
  purpose === activeReaderSummaryPurposes.generate || purpose === activeReaderSummaryPurposes.repair
    ? LLM_MAX_OUTPUT_BYTES
    : LLM_DEFAULT_OUTPUT_BYTES;
