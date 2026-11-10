import {
  gatewayDefaultReasoningEffort,
  isGatewayReaderSummaryBackend,
  isGatewayReaderSummaryModel,
  isGatewayReaderSummaryReasoningEffort,
  resolveGatewayReaderSummaryRoute,
  gatewayRouteModel,
  kimiCodeReaderSummaryBackend,
  kimiCodeReaderSummaryModel,
} from "./reader-summary-gateway-route-policy";
import type {
  ReaderSummaryGenerationBackend,
  GatewayReaderSummaryBackend,
} from "./reader-summary-gateway-route-policy";
import {
  activeReaderSummaryProvider,
  mimoReaderSummaryBackend,
  mimoReaderSummaryModel,
} from "./reader-summary-runtime-contract";
import {
  activeReaderSummaryModel,
  activeReaderSummaryReasoningEffort,
  codexGatewayReaderSummaryReasoningEffort,
  codexReaderSummaryBackend,
  isCodexGatewayOnlyReaderSummaryModel,
  isCodexGatewayReaderSummaryRoute,
  resolveCodexGatewayReaderSummaryRoute,
} from "./codex-reader-summary-route";

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
