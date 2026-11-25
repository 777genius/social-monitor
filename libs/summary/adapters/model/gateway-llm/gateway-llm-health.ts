import { gatewayLlmRuntimeEngine } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type { AgentRuntimeHealthResult } from "../../../ports";
import type { GatewayLlmSdkIdentity } from "./gateway-llm-sdk-identity";

/**
 * The gateway's health probe and SDK identity are infrastructure concerns,
 * independent of task dispatch, accounts, retry budgets and model output.
 * Probe failures stay not_serving; they never leak into task admission.
 */
export const readGatewayLlmHealth = async (
  sdk: GatewayLlmSdkIdentity,
  probe?: () => Promise<boolean>,
): Promise<AgentRuntimeHealthResult> => {
  let serving = true;
  try {
    serving = probe === undefined || await probe();
  } catch {
    serving = false;
  }
  return {
    status: serving ? "serving" : "not_serving",
    runtimeEngine: gatewayLlmRuntimeEngine,
    runtimeVersion: sdk.packageVersion,
    launcherSha256: sdk.archiveSha256,
    warnings: [],
  };
};
