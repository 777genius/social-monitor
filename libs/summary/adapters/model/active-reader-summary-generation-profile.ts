import {
  canonicalJsonSha256,
  executionAttestationOutputMatches,
  gatewayLlmRuntimeEngine,
  isConcreteRuntimePackageVersion,
  isSha256Hex,
  subscriptionRuntimeEngine,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "../../ports";
import type {
  ReaderSummaryAttestedTaskRole,
  VerifiedReaderSummaryExecutionAttestationSink,
} from "./reader-summary-execution-attestation";
import {
  activeReaderSummaryModel,
  activeReaderSummaryReasoningEffort,
  codexGatewayReaderSummaryReasoningEffort,
  codexReaderSummaryBackend,
  isCodexGatewayOnlyReaderSummaryModel,
  isCodexGatewayReaderSummaryRoute,
  resolveCodexGatewayReaderSummaryRoute,
} from "./codex-reader-summary-route";

export const activeReaderSummaryProvider = "codex" as const;
// Codex identities and gateway pairs live in their own module; re-exported here
// so every adapter and verifier keeps one profile entry point.
export {
  activeReaderSummaryModel,
  activeReaderSummaryReasoningEffort,
  codexReaderSummaryBackend,
  isCodexGatewayOnlyReaderSummaryModel,
  readerSummaryCliRuntimeEnv,
  readerSummaryGatewayTransport,
  resolveCodexGatewayReaderSummaryRoute,
} from "./codex-reader-summary-route";
export const mimoReaderSummaryBackend = "xiaomi-mimo-token-plan" as const;
export const mimoReaderSummaryModel = "mimo-v2.6-pro" as const;
export const mimoPresentationReasoningEffort = "none" as const;
// At most 32 independent story tasks must fit inside the daily execution lease.
export const mimoPresentationMaxTimeoutMs = 60_000;

/**
 * Gateway-only backends. They run through account-gateway profiles, so their
 * physical model and reasoning policy come from the gateway route, never from
 * the Codex or MiMo CLI defaults. The task provider stays "codex": it names
 * the Responses protocol family the verifiers already bind.
 */
export const kimiCodeReaderSummaryBackend = "kimi-code" as const;
export const openRouterReaderSummaryBackend = "openrouter" as const;
/** Kimi Code serves exactly this model, always reasons and rejects any reasoning control. */
export const kimiCodeReaderSummaryModel = "k3-256k" as const;
export const defaultOpenRouterReaderSummaryModel = "openai/gpt-oss-120b" as const;
/** Attested effort of a gateway task that sent no reasoning control. */
export const gatewayDefaultReasoningEffort = "default" as const;

export type GatewayReaderSummaryBackend =
  | typeof kimiCodeReaderSummaryBackend
  | typeof openRouterReaderSummaryBackend;

export type ReaderSummaryGenerationBackend =
  | typeof codexReaderSummaryBackend
  | typeof mimoReaderSummaryBackend
  | GatewayReaderSummaryBackend;

/** Model and reasoning policy of the one gateway route used by a run. */
export type GatewayReaderSummaryRoute = {
  readonly backend: GatewayReaderSummaryBackend;
  readonly model: string;
  /** gatewayDefaultReasoningEffort, or an effort the route sends explicitly. */
  readonly reasoningEffort: string;
};

const gatewayEfforts: ReadonlySet<string> = new Set(
  ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);
const gatewayModelId = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

export const isGatewayReaderSummaryBackend = (
  value: unknown,
): value is GatewayReaderSummaryBackend =>
  value === kimiCodeReaderSummaryBackend || value === openRouterReaderSummaryBackend;

/**
 * A model only the gateway runs. It never reuses the CLI model names, which
 * keep their own effort policy; gateway-only Codex models are included.
 */
export const isGatewayReaderSummaryModel = (value: unknown): value is string =>
  typeof value === "string" && gatewayModelId.test(value) &&
  value !== activeReaderSummaryModel && value !== mimoReaderSummaryModel;

export const isGatewayReaderSummaryReasoningEffort = (value: unknown): value is string =>
  value === gatewayDefaultReasoningEffort ||
  (typeof value === "string" && gatewayEfforts.has(value));

/**
 * Engine, model and effort of an attested execution whose model only the
 * gateway runs. A gateway-only Codex model keeps its allowed Codex effort.
 * Agreement across the tasks of one day is checked by the publication
 * verifiers.
 */
export const isGatewayReaderSummaryExecution = (attestation: {
  readonly runtimeEngine?: unknown;
  readonly model?: unknown;
  readonly reasoningEffort?: unknown;
}): boolean =>
  attestation.runtimeEngine === gatewayLlmRuntimeEngine &&
  isGatewayReaderSummaryModel(attestation.model) &&
  isGatewayReaderSummaryReasoningEffort(attestation.reasoningEffort) &&
  (!isCodexGatewayOnlyReaderSummaryModel(attestation.model) ||
    isCodexGatewayReaderSummaryRoute(attestation.model, attestation.reasoningEffort));

/**
 * The gateway route selected by AGENT_RUNTIME_READER_SUMMARY_BACKEND, or
 * undefined for a CLI backend. Kimi Code is pinned to its one model without
 * reasoning; OpenRouter takes any catalog model and an optional effort.
 */
export const resolveGatewayReaderSummaryRoute = (
  env: NodeJS.ProcessEnv,
): GatewayReaderSummaryRoute | undefined => {
  const backend = env.AGENT_RUNTIME_READER_SUMMARY_BACKEND?.trim();
  if (!isGatewayReaderSummaryBackend(backend)) return undefined;
  const model = env.AGENT_RUNTIME_GATEWAY_LLM_MODEL?.trim() || undefined;
  const effort = env.AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT?.trim() || undefined;
  if (backend === kimiCodeReaderSummaryBackend) {
    if (model !== undefined && model !== kimiCodeReaderSummaryModel) {
      throw new Error("AGENT_RUNTIME_GATEWAY_LLM_MODEL must be k3-256k for kimi-code");
    }
    if (effort !== undefined) {
      throw new Error("kimi-code rejects reasoning control; unset AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT");
    }
    return { backend, model: kimiCodeReaderSummaryModel,
      reasoningEffort: gatewayDefaultReasoningEffort };
  }
  const selected = model ?? defaultOpenRouterReaderSummaryModel;
  // Codex model names keep the Codex profile and their allowed efforts.
  if (!isGatewayReaderSummaryModel(selected) || isCodexGatewayOnlyReaderSummaryModel(selected)) {
    throw new Error("AGENT_RUNTIME_GATEWAY_LLM_MODEL is not a gateway model id");
  }
  if (effort !== undefined && !gatewayEfforts.has(effort)) {
    throw new Error("AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT is not a supported effort");
  }
  return { backend, model: selected,
    reasoningEffort: effort ?? gatewayDefaultReasoningEffort };
};

/** Purpose-specific model overrides must name the gateway model or stay unset. */
const gatewayRouteModel = (
  route: { readonly model: string },
  purposeModel: string | undefined,
): string => {
  if (purposeModel !== undefined && purposeModel.trim() !== "" &&
    purposeModel.trim() !== route.model) {
    throw new Error("Gateway reader summary model conflicts with purpose policy");
  }
  return route.model;
};

/**
 * Shared effort of daily tasks: a gateway route owns it, CLI backends use the
 * purpose effort. The Codex settings stay validated under a Codex gateway route.
 */
export const resolveReaderSummaryReasoningEffortFromEnv = (
  env: NodeJS.ProcessEnv,
): string | undefined => {
  const gateway = resolveGatewayReaderSummaryRoute(env);
  if (gateway !== undefined) return gateway.reasoningEffort;
  const shared = parseActiveReaderSummaryReasoningEffort(
    env.AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT ?? env.AGENT_RUNTIME_REASONING_EFFORT);
  return resolveCodexGatewayReaderSummaryRoute(env)?.reasoningEffort ?? shared;
};

/** A gateway task names its backend; the default effort sends no reasoning control. */
export const readerSummaryRouteControls = (
  backend: ReaderSummaryGenerationBackend,
  reasoningEffort: string,
): { readonly modelBackend?: GatewayReaderSummaryBackend; readonly reasoningEffort?: string } => ({
  ...(isGatewayReaderSummaryBackend(backend) ? { modelBackend: backend } : {}),
  ...(reasoningEffort === gatewayDefaultReasoningEffort ? {} : { reasoningEffort }),
});

/**
 * Effort of one adapter: a gateway backend defaults to sending none and
 * accepts only gateway efforts, a gateway-only Codex model takes one of its
 * allowed efforts, and every other CLI model keeps its fixed effort.
 */
export const resolveReaderSummaryBackendEffort = (
  backend: ReaderSummaryGenerationBackend,
  requested: string | undefined,
  cliEffort: string,
  model: string,
): string => {
  if (isGatewayReaderSummaryBackend(backend)) {
    const effort = requested ?? gatewayDefaultReasoningEffort;
    if (isGatewayReaderSummaryReasoningEffort(effort)) return effort;
  } else if (backend === codexReaderSummaryBackend && isCodexGatewayOnlyReaderSummaryModel(model)) {
    const effort = requested ?? codexGatewayReaderSummaryReasoningEffort(model);
    if (isCodexGatewayReaderSummaryRoute(model, effort)) return effort;
  } else if ((requested ?? cliEffort) === cliEffort) {
    return cliEffort;
  }
  throw new Error("Reader summary execution profile and effort conflict");
};

/** Daily task adapters: MiMo and gateway backends pin the model they were configured with. */
export const assertReaderSummaryBackendModel = (
  backend: ReaderSummaryGenerationBackend,
  model: string,
): void => {
  if (backend === mimoReaderSummaryBackend && model !== mimoReaderSummaryModel) {
    throw new Error("MiMo reader summary model conflicts with purpose policy");
  }
  if (isGatewayReaderSummaryBackend(backend)) {
    resolveReaderSummaryGenerationIdentity({ backend, model });
  }
};

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
  if (isGatewayReaderSummaryBackend(input.backend)) {
    if (input.legacyRecovery || !isGatewayReaderSummaryModel(input.model) ||
      isCodexGatewayOnlyReaderSummaryModel(input.model) ||
      (input.backend === kimiCodeReaderSummaryBackend &&
        input.model !== kimiCodeReaderSummaryModel)) {
      throw new Error("Gateway reader summary model conflicts with purpose policy");
    }
    return { provider, model: input.model, backend: input.backend };
  }
  // A gateway-only Codex model never serves the frozen legacy recovery.
  if (isCodexGatewayOnlyReaderSummaryModel(input.model)) {
    if (input.legacyRecovery) {
      throw new Error("Codex gateway reader summary model conflicts with legacy recovery");
    }
    return { provider, model: input.model, backend: codexReaderSummaryBackend };
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
  // workflows; MiMo and gateway selection use the backend and
  // purpose-specific models.
  const sharedModel = parseActiveReaderSummaryModel(
    env.AGENT_RUNTIME_READER_SUMMARY_MODEL,
  );
  const generationModel =
    env.AGENT_RUNTIME_READER_SUMMARY_GENERATION_MODEL?.trim() || undefined;
  const backend = env.AGENT_RUNTIME_READER_SUMMARY_BACKEND?.trim();
  const codexGateway = resolveCodexGatewayReaderSummaryRoute(env);
  if (codexGateway !== undefined) {
    return resolveReaderSummaryGenerationIdentity({
      provider: env.AGENT_RUNTIME_PROVIDER,
      model: gatewayRouteModel(codexGateway, generationModel),
    });
  }
  if (backend === undefined || backend === "" || backend === "openai-chatgpt") {
    return resolveReaderSummaryGenerationIdentity({
      provider: env.AGENT_RUNTIME_PROVIDER,
      model: generationModel ?? sharedModel,
    });
  }
  const gateway = resolveGatewayReaderSummaryRoute(env);
  if (gateway !== undefined) {
    return resolveReaderSummaryGenerationIdentity({
      provider: env.AGENT_RUNTIME_PROVIDER,
      backend: gateway.backend,
      model: gatewayRouteModel(gateway, generationModel),
    });
  }
  if (backend !== mimoReaderSummaryBackend) {
    throw new Error(backendMessage);
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
): { readonly model: string; readonly modelBackend: ReaderSummaryGenerationBackend } => {
  const backend = env.AGENT_RUNTIME_READER_SUMMARY_BACKEND?.trim();
  const codexGateway = resolveCodexGatewayReaderSummaryRoute(env);
  if (codexGateway !== undefined) {
    return { model: gatewayRouteModel(codexGateway, purposeModel), modelBackend: codexReaderSummaryBackend };
  }
  if (backend === undefined || backend === "" || backend === "openai-chatgpt") {
    return {
      model: parseActiveReaderSummaryModel(
        purposeModel ?? env.AGENT_RUNTIME_READER_SUMMARY_MODEL,
      ) ?? activeReaderSummaryModel,
      modelBackend: "openai-chatgpt",
    };
  }
  const gateway = resolveGatewayReaderSummaryRoute(env);
  if (gateway !== undefined) {
    return { model: gatewayRouteModel(gateway, purposeModel), modelBackend: gateway.backend };
  }
  if (backend !== mimoReaderSummaryBackend) {
    throw new Error(backendMessage);
  }
  if (purposeModel !== undefined && purposeModel.trim() !== mimoReaderSummaryModel) {
    throw new Error("MiMo reader summary model conflicts with purpose policy");
  }
  return { model: mimoReaderSummaryModel, modelBackend: backend };
};

const backendMessage =
  "AGENT_RUNTIME_READER_SUMMARY_BACKEND must be openai-chatgpt, xiaomi-mimo-token-plan, kimi-code or openrouter";

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
  promotionPresentation:
    "social_monitor.reader_summary.promotion_presentation.v3",
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

export const assertMimoReaderSummaryExecution = (params: {
  readonly command: AgentRuntimeTaskCommand;
  readonly result: AgentRuntimeTaskResult;
  readonly purpose: string;
}): NonNullable<AgentRuntimeTaskResult["executionAttestation"]> => {
  const attestation = params.result.executionAttestation;
  if (params.command.purpose !== params.purpose ||
    params.command.provider !== activeReaderSummaryProvider ||
    params.command.controls.model !== mimoReaderSummaryModel ||
    params.command.controls.modelBackend !== mimoReaderSummaryBackend ||
    params.result.status !== "completed" ||
    attestation === undefined ||
    attestation.schemaVersion !== 1 ||
    attestation.requestId !== params.command.requestId ||
    attestation.purpose !== params.purpose ||
    attestation.provider !== activeReaderSummaryProvider ||
    attestation.model !== mimoReaderSummaryModel ||
    params.command.controls.reasoningEffort !== (params.purpose === activeReaderSummaryPurposes.promotionPresentation
      ? mimoPresentationReasoningEffort : activeReaderSummaryReasoningEffort) ||
    attestation.reasoningEffort !== (params.purpose === activeReaderSummaryPurposes.promotionPresentation
      ? mimoPresentationReasoningEffort : activeReaderSummaryReasoningEffort) ||
    attestation.runtimeEngine !== subscriptionRuntimeEngine ||
    !isConcreteRuntimePackageVersion(attestation.runtimePackageVersion) ||
    !isSha256Hex(attestation.canonicalRequestSha256) ||
    !isSha256Hex(attestation.launcherSha256) ||
    attestation.selectedOutputKind !== "structured_output" ||
    !isSha256Hex(attestation.selectedOutputSha256) ||
    !executionAttestationOutputMatches(attestation, params.result)) {
    throw new Error("Reader summary execution attestation is invalid");
  }
  return attestation;
};

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
