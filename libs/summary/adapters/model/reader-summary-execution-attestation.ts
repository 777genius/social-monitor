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
import {
  activeReaderSummaryModel,
  activeReaderSummaryProvider,
  activeReaderSummaryPurposes,
  frozenLegacyReaderSummaryRecoveryContract,
  type FrozenLegacyReaderSummaryRecoveryContract,
} from "./active-reader-summary-generation-profile";

export type ReaderSummaryAttestedTaskRole =
  | "summary"
  | "topic_label"
  | "topic_relation"
  | "story_relation"
  | "related_topic_relation"
  | "weekly_review";

export type VerifiedReaderSummaryExecutionAttestation = {
  readonly taskRole: ReaderSummaryAttestedTaskRole;
  readonly attempt: string;
  readonly normalizedOutputSha256: string;
  readonly attestation: AgentRuntimeExecutionAttestation;
};

export type VerifiedReaderSummaryExecutionProof = Readonly<{
  normalizedOutputSha256: string;
  executionAttestationSha256: string;
  selectedOutputSha256: string;
}>;

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
  readonly legacyRecoveryContract?: FrozenLegacyReaderSummaryRecoveryContract;
  readonly sink?: VerifiedReaderSummaryExecutionAttestationSink;
}): Promise<VerifiedReaderSummaryExecutionProof> => {
  const attestation = params.result.executionAttestation;
  if (
    params.result.status !== "completed" ||
    attestation === undefined ||
    attestation.schemaVersion !== 1 ||
    attestation.requestId !== params.command.requestId ||
    attestation.purpose !== params.command.purpose ||
    attestation.provider !== params.command.provider ||
    attestation.provider !== activeReaderSummaryProvider ||
    attestation.model !== activeReaderSummaryModel ||
    attestation.reasoningEffort !== expectedReasoningEffort(
      params.legacyRecoveryContract,
    ) ||
    !activeReaderSummaryPurposeMatches(
      params.taskRole,
      params.attempt,
      attestation.purpose,
      params.legacyRecoveryContract,
    ) ||
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

  const normalizedOutputSha256 = canonicalJsonSha256(params.normalizedOutput);
  await params.sink?.record({
    taskRole: params.taskRole,
    attempt: params.attempt,
    normalizedOutputSha256,
    attestation,
  });
  return {
    normalizedOutputSha256,
    executionAttestationSha256: canonicalJsonSha256(attestation),
    selectedOutputSha256: attestation.selectedOutputSha256,
  };
};

const activeReaderSummaryPurposeMatches = (
  role: ReaderSummaryAttestedTaskRole,
  attempt: string,
  purpose: string,
  legacyRecoveryContract?: FrozenLegacyReaderSummaryRecoveryContract,
): boolean => ({
  summary: legacyRecoveryContract === frozenLegacyReaderSummaryRecoveryContract
    ? attempt === "primary"
      ? [frozenLegacyReaderSummaryRecoveryContract.purposes.generate]
      : attempt === "repair"
        ? [frozenLegacyReaderSummaryRecoveryContract.purposes.repair]
        : []
    : attempt === "primary"
      ? [activeReaderSummaryPurposes.generate]
      : attempt === "repair"
        ? [activeReaderSummaryPurposes.repair]
        : [],
  topic_label: [activeReaderSummaryPurposes.topicLabel],
  topic_relation: [activeReaderSummaryPurposes.topicRelations],
  story_relation: [activeReaderSummaryPurposes.storyRelations],
  related_topic_relation: [activeReaderSummaryPurposes.relatedTopicRelations],
  weekly_review: [activeReaderSummaryPurposes.weeklyReview],
} as const)[role].some((candidate: string) => candidate === purpose);

const expectedReasoningEffort = (
  legacyRecoveryContract?: FrozenLegacyReaderSummaryRecoveryContract,
): "high" | "xhigh" =>
  legacyRecoveryContract === frozenLegacyReaderSummaryRecoveryContract
    ? "xhigh"
    : "high";
