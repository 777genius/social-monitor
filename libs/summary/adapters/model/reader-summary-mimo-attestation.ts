import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "../../ports";
import type {
  ReaderSummaryAttestedTaskRole,
  VerifiedReaderSummaryExecutionAttestationSink,
} from "./reader-summary-execution-attestation";
import { activeReaderSummaryPurposes } from "./reader-summary-runtime-contract";
import { assertMimoReaderSummaryExecution } from "./reader-summary-mimo-execution-admission";

// Keep historical direct imports on the identical pure function object.
export { assertMimoReaderSummaryExecution } from "./reader-summary-mimo-execution-admission";

const mimoDailyPurposeByRole = Object.freeze({
  topic_label: activeReaderSummaryPurposes.topicLabel,
  topic_relation: activeReaderSummaryPurposes.topicRelations,
  story_relation: activeReaderSummaryPurposes.storyRelations,
  related_topic_relation: activeReaderSummaryPurposes.relatedTopicRelations,
} as const);

export const verifyAndRecordMimoDailyExecution = async (params: {
  readonly command: AgentRuntimeTaskCommand;
  readonly result: AgentRuntimeTaskResult;
  readonly taskRole: ReaderSummaryAttestedTaskRole;
  readonly attempt: string;
  readonly normalizedOutput: unknown;
  readonly sink?: VerifiedReaderSummaryExecutionAttestationSink;
}): Promise<void> => {
  const expectedPurpose = mimoDailyPurposeByRole[
    params.taskRole as keyof typeof mimoDailyPurposeByRole
  ];
  if (expectedPurpose === undefined) {
    throw new Error("Reader summary execution attestation is invalid");
  }
  const attestation = assertMimoReaderSummaryExecution({ ...params, purpose: expectedPurpose });
  await params.sink?.record({
    taskRole: params.taskRole,
    attempt: params.attempt,
    normalizedOutputSha256: canonicalJsonSha256(params.normalizedOutput),
    attestation,
  });
};
