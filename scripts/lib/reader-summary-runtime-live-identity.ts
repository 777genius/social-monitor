import {
  isConcreteRuntimePackageVersion,
  isSha256Hex,
  subscriptionRuntimeEngine,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type { AgentRuntimeClientPort } from "@social-monitor/summary/ports";

export const productionRuntimeLiveIdentityFormat =
  "reader-summary-runtime-live-identity-v1";

export type ProductionRuntimeLiveIdentity = {
  readonly schemaVersion: 1;
  readonly format: typeof productionRuntimeLiveIdentityFormat;
  readonly checkedAt: string;
  readonly status: "serving";
  readonly runtimeEngine: typeof subscriptionRuntimeEngine;
  readonly runtimePackageVersion: string;
  readonly launcherSha256: string;
};

export const runtimeLiveIdentityProofRequired = (
  executionMode:
    "live-production" | "historical-regeneration" | "historical-reuse",
): boolean => executionMode !== "historical-reuse";

export const probeProductionRuntimeLiveIdentity = async (params: {
  readonly client: Pick<AgentRuntimeClientPort, "checkHealth">;
  readonly checkedAt: string;
}): Promise<ProductionRuntimeLiveIdentity> => {
  const health = await params.client.checkHealth(
    "reader-summary-production-day-proof-out",
  );
  if (
    health.status !== "serving" ||
    health.runtimeEngine !== subscriptionRuntimeEngine ||
    !isConcreteRuntimePackageVersion(health.runtimeVersion) ||
    !isSha256Hex(health.launcherSha256) ||
    !isExactIsoTimestamp(params.checkedAt)
  ) {
    throw new Error(
      "Live subscription runtime identity is not production-safe",
    );
  }

  return {
    schemaVersion: 1,
    format: productionRuntimeLiveIdentityFormat,
    checkedAt: params.checkedAt,
    status: "serving",
    runtimeEngine: subscriptionRuntimeEngine,
    runtimePackageVersion: health.runtimeVersion,
    launcherSha256: health.launcherSha256,
  };
};

export const serializeProductionRuntimeLiveIdentity = (
  identity: ProductionRuntimeLiveIdentity,
): Buffer => Buffer.from(`${JSON.stringify(identity, null, 2)}\n`, "utf8");

const isExactIsoTimestamp = (value: string): boolean => {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
};
