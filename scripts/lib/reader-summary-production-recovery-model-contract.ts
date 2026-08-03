import { executionAttestationOutputMatches } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeExecutionAttestation,
} from "@social-monitor/summary/ports";

export const readerSummaryProductionRecoveryModelContract = Object.freeze({
  schemaVersion: "reader_summary.production_recovery_model_contract.v1" as const,
  runtimeEngine: "subscription-runtime-cli" as const,
  provider: "codex" as const,
  model: "gpt-5.6-sol" as const,
  reasoningEffort: "xhigh" as const,
  purpose: "social_monitor.reader_summary.generate" as const,
  attestationRequired: true as const,
});

export type ReaderSummaryProductionRecoveryModelContract =
  typeof readerSummaryProductionRecoveryModelContract;

export const readerSummaryProductionRecoveryGenerationProfile = Object.freeze({
  modelVersion: "codex:gpt-5.6-sol:xhigh" as const,
  promptVersion: "reader_summary.prompt.2026-07-14.daily_synthesis" as const,
  rankingPolicyVersion: "story_ranking_v10" as const,
});

export const assertReaderSummaryProductionRecoveryModelSelection = (
  value: Readonly<{
    provider: string;
    model: string;
    reasoningEffort: string;
    runtimeEngine: string;
  }>,
): ReaderSummaryProductionRecoveryModelContract => {
  const expected = readerSummaryProductionRecoveryModelContract;
  if (
    value.provider !== expected.provider ||
    value.model !== expected.model ||
    value.reasoningEffort !== expected.reasoningEffort ||
    value.runtimeEngine !== expected.runtimeEngine
  ) {
    throw new Error(
      "Reader summary production recovery requires exact subscription-runtime-cli codex gpt-5.6-sol xhigh selection",
    );
  }
  return expected;
};

export const assertReaderSummaryProductionRecoveryExecutionAttestation = (
  attestation: AgentRuntimeExecutionAttestation | undefined,
): AgentRuntimeExecutionAttestation => {
  const expected = readerSummaryProductionRecoveryModelContract;
  if (
    attestation === undefined ||
    attestation.schemaVersion !== 1 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(attestation.requestId) ||
    attestation.runtimeEngine !== expected.runtimeEngine ||
    attestation.provider !== expected.provider ||
    attestation.model !== expected.model ||
    attestation.reasoningEffort !== expected.reasoningEffort ||
    attestation.purpose !== expected.purpose ||
    attestation.selectedOutputKind !== "structured_output" ||
    !isSha256(attestation.canonicalRequestSha256) ||
    !isSha256(attestation.launcherSha256) ||
    !isSha256(attestation.selectedOutputSha256) ||
    !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/u.test(
      attestation.runtimePackageVersion,
    )
  ) {
    throw new Error(
      "Reader summary production recovery execution attestation is not exact",
    );
  }
  return attestation;
};

export const requireReaderSummaryProductionRecoveryAttestation = (
  client: AgentRuntimeClientPort,
): AgentRuntimeClientPort => ({
  runTask: async (command) => {
    const result = await client.runTask(command);
    const attestation = assertReaderSummaryProductionRecoveryExecutionAttestation(
      result.executionAttestation,
    );
    if (
      attestation.requestId !== command.requestId ||
      attestation.purpose !== command.purpose ||
      attestation.provider !== command.provider ||
      !executionAttestationOutputMatches(attestation, result)
    ) {
      throw new Error(
        "Reader summary production recovery execution attestation is ambiguous",
      );
    }
    return result;
  },
  checkHealth: async (service) => {
    const health = await client.checkHealth(service);
    if (
      health.runtimeEngine !==
        readerSummaryProductionRecoveryModelContract.runtimeEngine ||
      !isConcreteVersion(health.runtimeVersion) ||
      (health.launcherSha256 !== undefined && !isSha256(health.launcherSha256))
    ) {
      throw new Error(
        "Reader summary production recovery runtime health is not exact",
      );
    }
    return health;
  },
});

const isSha256 = (value: string): boolean =>
  /^[0-9a-f]{64}$/u.test(value);

const isConcreteVersion = (value: string): boolean =>
  /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u.test(value) &&
  !/(?:unknown|dev|local|snapshot)/iu.test(value);
