import {
  canonicalJsonSha256,
  executionAttestationOutputMatches,
  isConcreteRuntimePackageVersion,
  isSha256Hex,
  subscriptionRuntimeEngine,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";

import type {
  AgentRuntimeExecutionAttestation,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
} from "../../ports";

export type ReaderSummaryAttestedTaskRole =
  "summary" | "topic_label" | "topic_relation" | "story_relation";

export type VerifiedReaderSummaryExecutionAttestation = {
  readonly taskRole: ReaderSummaryAttestedTaskRole;
  readonly attempt: string;
  readonly normalizedOutputSha256: string;
  readonly attestation: AgentRuntimeExecutionAttestation;
};

export interface VerifiedReaderSummaryExecutionAttestationSink {
  record(
    value: VerifiedReaderSummaryExecutionAttestation,
  ): void | Promise<void>;
}

export const verifyAndRecordReaderSummaryExecution = async (params: {
  readonly command: AgentRuntimeTaskCommand;
  readonly result: AgentRuntimeTaskResult;
  readonly taskRole: ReaderSummaryAttestedTaskRole;
  readonly attempt: string;
  readonly normalizedOutput: unknown;
  readonly sink?: VerifiedReaderSummaryExecutionAttestationSink;
}): Promise<void> => {
  const attestation = params.result.executionAttestation;
  if (
    params.result.status !== "completed" ||
    attestation === undefined ||
    attestation.schemaVersion !== 1 ||
    attestation.requestId !== params.command.requestId ||
    attestation.purpose !== params.command.purpose ||
    attestation.provider !== params.command.provider ||
    attestation.provider !== "codex" ||
    attestation.model !== "gpt-5.6-sol" ||
    attestation.reasoningEffort !== "xhigh" ||
    attestation.runtimeEngine !== subscriptionRuntimeEngine ||
    !isConcreteRuntimePackageVersion(attestation.runtimePackageVersion) ||
    !isSha256Hex(attestation.canonicalRequestSha256) ||
    !isSha256Hex(attestation.launcherSha256) ||
    attestation.selectedOutputKind !== "structured_output" ||
    !isSha256Hex(attestation.selectedOutputSha256) ||
    !executionAttestationOutputMatches(attestation, params.result)
  ) {
    throw new Error("Reader summary execution attestation is invalid");
  }

  await params.sink?.record({
    taskRole: params.taskRole,
    attempt: params.attempt,
    normalizedOutputSha256: canonicalJsonSha256(params.normalizedOutput),
    attestation,
  });
};
