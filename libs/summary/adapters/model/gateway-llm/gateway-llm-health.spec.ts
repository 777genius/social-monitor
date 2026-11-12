import { gatewayLlmRuntimeEngine } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { readGatewayLlmHealth } from "./gateway-llm-health";

describe("gateway LLM runtime health boundary", () => {
  const sdk = { packageVersion: "fixture-sdk-1", archiveSha256: "a".repeat(64) };

  it("reports SDK identity as serving with no configured probe", async () => {
    await expect(readGatewayLlmHealth(sdk)).resolves.toEqual({
      status: "serving",
      runtimeEngine: gatewayLlmRuntimeEngine,
      runtimeVersion: sdk.packageVersion,
      launcherSha256: sdk.archiveSha256,
      warnings: [],
    });
  });

  it("calls the explicit probe exactly once and reports false as not_serving", async () => {
    const probe = jest.fn(async () => false);
    await expect(readGatewayLlmHealth(sdk, probe)).resolves.toMatchObject({
      status: "not_serving",
      runtimeVersion: sdk.packageVersion,
    });
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("fails closed on probe exceptions without losing attested SDK metadata", async () => {
    const probe = jest.fn(async (): Promise<boolean> => {
      throw new Error("synthetic offline probe");
    });
    await expect(readGatewayLlmHealth(sdk, probe)).resolves.toEqual({
      status: "not_serving",
      runtimeEngine: gatewayLlmRuntimeEngine,
      runtimeVersion: sdk.packageVersion,
      launcherSha256: sdk.archiveSha256,
      warnings: [],
    });
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("preserves positive probe results as serving", async () => {
    await expect(readGatewayLlmHealth(sdk, async () => true)).resolves
      .toMatchObject({ status: "serving" });
  });
});
