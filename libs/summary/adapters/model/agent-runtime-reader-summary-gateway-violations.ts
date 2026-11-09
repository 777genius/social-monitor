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
    return (reported.length > 0 ? reported : [first ?? "json_parse_or_empty"])
      .slice(0, maxReportedOutputViolations);
};
