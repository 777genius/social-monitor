import {
  canonicalJsonSha256,
  executionAttestationOutputMatches,
  isConcreteRuntimePackageVersion,
  isSha256Hex,
  subscriptionRuntimeEngine,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "../../ports";
import type {
  ReaderSummaryAttestedTaskRole,
  VerifiedReaderSummaryExecutionAttestationSink,
} from "./reader-summary-execution-attestation";

export const activeReaderSummaryProvider = "codex" as const;
export const activeReaderSummaryModel = "gpt-5.6-sol" as const;
export const activeReaderSummaryReasoningEffort = "high" as const;
export const mimoReaderSummaryBackend = "xiaomi-mimo-token-plan" as const;
export const mimoReaderSummaryModel = "mimo-v2.6-pro" as const;

export type ReaderSummaryGenerationBackend =
  | "openai-chatgpt"
  | typeof mimoReaderSummaryBackend;

export const resolveReaderSummaryGenerationIdentity = (input: {
  readonly provider?: string;
  readonly model?: string;
  readonly backend?: ReaderSummaryGenerationBackend;
  readonly legacyRecovery?: boolean;
}): { readonly provider: typeof activeReaderSummaryProvider; readonly model: string;
  readonly backend: ReaderSummaryGenerationBackend } => {
  const provider = assertActiveReaderSummaryProvider(input.provider) ??
    activeReaderSummaryProvider;
  if (input.backend === mimoReaderSummaryBackend) {
    if (input.legacyRecovery ||
      (input.model !== undefined && input.model !== mimoReaderSummaryModel)) {
      throw new Error("MiMo reader summary model conflicts with purpose policy");
    }
    return { provider, model: mimoReaderSummaryModel, backend: mimoReaderSummaryBackend };
  }
  return {
    provider,
    model: parseActiveReaderSummaryModel(input.model) ?? activeReaderSummaryModel,
    backend: "openai-chatgpt",
  };
};

export const resolveReaderSummaryGenerationIdentityFromEnv = (
  env: NodeJS.ProcessEnv,
): { readonly provider: typeof activeReaderSummaryProvider; readonly model: string;
  readonly backend: ReaderSummaryGenerationBackend } => {
  // The historic shared model remains the Codex default for all daily
  // workflows; MiMo selection uses the backend and purpose-specific models.
  const sharedModel = parseActiveReaderSummaryModel(
    env.AGENT_RUNTIME_READER_SUMMARY_MODEL,
  );
  const generationModel =
    env.AGENT_RUNTIME_READER_SUMMARY_GENERATION_MODEL?.trim() || undefined;
  const backend = env.AGENT_RUNTIME_READER_SUMMARY_BACKEND?.trim();
  if (backend === undefined || backend === "" || backend === "openai-chatgpt") {
    return resolveReaderSummaryGenerationIdentity({
      provider: env.AGENT_RUNTIME_PROVIDER,
      model: generationModel ?? sharedModel,
    });
  }
  if (backend !== mimoReaderSummaryBackend) {
    throw new Error("AGENT_RUNTIME_READER_SUMMARY_BACKEND must be openai-chatgpt or xiaomi-mimo-token-plan");
  }
  return resolveReaderSummaryGenerationIdentity({
    provider: env.AGENT_RUNTIME_PROVIDER,
    backend,
    model: generationModel,
  });
};

// Daily topic and relation calls share the summary backend, while their
// individual model overrides remain purpose-specific.
export const resolveReaderSummaryDailyTaskIdentityFromEnv = (
  env: NodeJS.ProcessEnv,
  purposeModel: string | undefined,
): { readonly model: typeof activeReaderSummaryModel | typeof mimoReaderSummaryModel;
  readonly modelBackend: ReaderSummaryGenerationBackend } => {
  const backend = env.AGENT_RUNTIME_READER_SUMMARY_BACKEND?.trim();
  if (backend === undefined || backend === "" || backend === "openai-chatgpt") {
    return {
      model: parseActiveReaderSummaryModel(
        purposeModel ?? env.AGENT_RUNTIME_READER_SUMMARY_MODEL,
      ) ?? activeReaderSummaryModel,
      modelBackend: "openai-chatgpt",
    };
  }
  if (backend !== mimoReaderSummaryBackend) {
    throw new Error("AGENT_RUNTIME_READER_SUMMARY_BACKEND must be openai-chatgpt or xiaomi-mimo-token-plan");
  }
  if (purposeModel !== undefined && purposeModel.trim() !== mimoReaderSummaryModel) {
    throw new Error("MiMo reader summary model conflicts with purpose policy");
  }
  return { model: mimoReaderSummaryModel, modelBackend: backend };
};

export const activeReaderSummaryPurposes = Object.freeze({
  generate: "social_monitor.reader_summary.generate.v2",
  repair: "social_monitor.reader_summary.repair.v2",
  topicLabel: "social_monitor.reader_summary.topic_map.label.v2",
  topicRelations:
    "social_monitor.reader_summary.topic_map.verify_relations.v2",
  storyRelations:
    "social_monitor.reader_summary.verify_story_relations.v2",
  relatedTopicRelations:
    "social_monitor.reader_summary.verify_related_topic_relations.v2",
  dailyCanonicalRecovery:
    "social_monitor.reader_summary.daily.canonical_recovery.v2",
  weeklyReview: "social_monitor.reader_summary.weekly.review.v2",
  weeklyGenerate: "social_monitor.reader_summary.weekly.generate.v2",
} as const);

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
  const attestation = params.result.executionAttestation;
  if (expectedPurpose === undefined ||
    params.command.purpose !== expectedPurpose ||
    params.command.provider !== activeReaderSummaryProvider ||
    params.command.controls.model !== mimoReaderSummaryModel ||
    params.command.controls.modelBackend !== mimoReaderSummaryBackend ||
    params.result.status !== "completed" ||
    attestation === undefined ||
    attestation.schemaVersion !== 1 ||
    attestation.requestId !== params.command.requestId ||
    attestation.purpose !== expectedPurpose ||
    attestation.provider !== activeReaderSummaryProvider ||
    attestation.model !== mimoReaderSummaryModel ||
    attestation.reasoningEffort !== activeReaderSummaryReasoningEffort ||
    attestation.runtimeEngine !== subscriptionRuntimeEngine ||
    !isConcreteRuntimePackageVersion(attestation.runtimePackageVersion) ||
    !isSha256Hex(attestation.canonicalRequestSha256) ||
    !isSha256Hex(attestation.launcherSha256) ||
    attestation.selectedOutputKind !== "structured_output" ||
    !isSha256Hex(attestation.selectedOutputSha256) ||
    !executionAttestationOutputMatches(attestation, params.result)) {
    throw new Error("Reader summary execution attestation is invalid");
  }
  await params.sink?.record({
    taskRole: params.taskRole,
    attempt: params.attempt,
    normalizedOutputSha256: canonicalJsonSha256(params.normalizedOutput),
    attestation,
  });
};

export const frozenLegacyReaderSummaryRecoveryContract = Object.freeze({
  recoveryOnly: true,
  reasoningEffort: "xhigh",
  purposes: Object.freeze({
    generate: "social_monitor.reader_summary.generate",
    repair: "social_monitor.reader_summary.repair",
  }),
} as const);

export type FrozenLegacyReaderSummaryRecoveryContract =
  typeof frozenLegacyReaderSummaryRecoveryContract;

export const parseActiveReaderSummaryModel = (
  value: string | undefined,
): typeof activeReaderSummaryModel | undefined =>
  parseOptionalExact(
    value,
    activeReaderSummaryModel,
    "AGENT_RUNTIME_READER_SUMMARY_MODEL must be gpt-5.6-sol",
  );

export const parseActiveReaderSummaryReasoningEffort = (
  value: string | undefined,
): typeof activeReaderSummaryReasoningEffort | undefined =>
  parseOptionalExact(
    value,
    activeReaderSummaryReasoningEffort,
    "AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT must be high",
  );

export const assertActiveReaderSummaryProvider = (
  value: string | undefined,
): typeof activeReaderSummaryProvider | undefined =>
  parseOptionalExact(
    value,
    activeReaderSummaryProvider,
    'AGENT_RUNTIME_PROVIDER must be "codex" for active reader summaries',
  );

const parseOptionalExact = <Expected extends string>(
  value: string | undefined,
  expected: Expected,
  message: string,
): Expected | undefined => {
  if (value === undefined || value.trim().length === 0) return undefined;
  if (value.trim() !== expected) throw new Error(message);
  return expected;
};
