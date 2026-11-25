import type { AgentRuntimeTaskResult } from "../../ports";
import { maxReportedOutputViolations, safeOutputViolationPattern } from "./gateway-llm/gateway-llm-output-violations";

/** Read only the gateway's bounded, non-provider-text schema diagnostics for one repair. */
export const extractReaderSummaryGatewaySchemaViolations = (result: AgentRuntimeTaskResult): readonly string[] | undefined => {
    const failure = result.status === "failed" ? result.failure : undefined;
    if (failure?.code !== "provider_output_invalid" ||
        failure.details?.outputValidationStage !== "schema_normalization" ||
        failure.details.outputValidationViolations === undefined) return undefined;
    const reported = (failure.details.outputValidationViolations ?? "").split(" ")
      .filter((entry) => safeOutputViolationPattern.test(entry));
    const first = failure.details.outputValidationPath;
    // The fallback path is also external failure metadata: never relay arbitrary
    // provider-originated text into the next attempt's repair instruction.
    const safeFirst = typeof first === "string" && safeOutputViolationPattern.test(first)
      ? first : "json_parse_or_empty";
    return (reported.length > 0 ? reported : [safeFirst])
      .slice(0, maxReportedOutputViolations);
};
