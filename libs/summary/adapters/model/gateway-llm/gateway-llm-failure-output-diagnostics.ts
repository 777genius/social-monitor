import type { LlmFailureCode } from "@agent-teams/account-gateway/llm";
import { safeOutputViolationPattern } from "./gateway-llm-output-violations";

/** Strict-decode verdict on rejected output; absent when decode never ran. */
export type GatewayLlmOutputViolations = {
  /** The decode's own first path:keyword. */
  readonly first: string;
  /** Every violation found, path:keyword or path:keyword=limit. */
  readonly all: readonly string[];
};

export const gatewayLlmOutputViolationDetails = (
  code: LlmFailureCode,
  outputViolations?: GatewayLlmOutputViolations,
): Readonly<Record<string, string>> =>
  code === "output_invalid"
    ? {
        outputValidationPath: safeOutputViolation(outputViolations?.first),
        outputValidationViolations: (outputViolations?.all ?? [])
          .filter((entry) => safeOutputViolationPattern.test(entry)).join(" "),
      }
    : {};

/**
 * A schema path and keyword only, never output text. Keys the model invented
 * can appear in the path, so anything outside a plain path shape is dropped.
 * Without a decode the text was empty or not JSON.
 */
const safeOutputViolation = (violation: string | undefined): string =>
  violation === undefined ? "json_parse_or_empty"
    : /^\$[A-Za-z0-9_.[\]]{0,160}:[A-Za-z_]{1,32}$/u.test(violation) ? violation : "unclassified";
