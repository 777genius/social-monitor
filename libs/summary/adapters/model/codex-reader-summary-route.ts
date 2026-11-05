/** Codex subscription backend; tasks that name no modelBackend run on it. */
export const codexReaderSummaryBackend = "openai-chatgpt" as const;
/** The Codex CLI identity: the only Codex model and effort the CLI runtime runs. */
export const activeReaderSummaryModel = "gpt-5.6-sol" as const;
export const activeReaderSummaryReasoningEffort = "high" as const;
/** AGENT_RUNTIME_TRANSPORT value of the account-gateway llm transport. */
export const readerSummaryGatewayTransport = "gateway-llm" as const;

/** One Codex model and the effort it runs at. */
export type CodexReaderSummaryRoute = {
  readonly model: string;
  readonly reasoningEffort: string;
};

/**
 * Codex model/effort pairs openai-chatgpt may run on the gateway transport;
 * the first is the default. gpt-5.6-sol/high is also the CLI identity, while
 * gpt-6.1-sol runs only behind the account-gateway Codex profile, whose live
 * account model catalog admits it for accounts enrolled under gpt-5.6-sol.
 */
export const defaultCodexGatewayReaderSummaryRoute: CodexReaderSummaryRoute =
  Object.freeze({ model: "gpt-6.1-sol", reasoningEffort: "low" });
export const codexGatewayReaderSummaryRoutes: readonly CodexReaderSummaryRoute[] = Object.freeze([
  defaultCodexGatewayReaderSummaryRoute,
  Object.freeze({ model: activeReaderSummaryModel, reasoningEffort: activeReaderSummaryReasoningEffort }),
]);

export const isCodexGatewayReaderSummaryRoute = (
  model: unknown, reasoningEffort: unknown,
): reasoningEffort is string =>
  codexGatewayReaderSummaryRoutes.some((route) =>
    route.model === model && route.reasoningEffort === reasoningEffort);

/** A Codex model that never runs on the CLI runtime. */
export const isCodexGatewayOnlyReaderSummaryModel = (value: unknown): value is string =>
  value !== activeReaderSummaryModel &&
  codexGatewayReaderSummaryRoutes.some((route) => route.model === value);

/** The first allowed effort of a gateway-only Codex model. */
export const codexGatewayReaderSummaryReasoningEffort = (model: string): string | undefined =>
  codexGatewayReaderSummaryRoutes.find((route) => route.model === model)?.reasoningEffort;

/**
 * Codex route of AGENT_RUNTIME_READER_SUMMARY_BACKEND=openai-chatgpt on the
 * gateway transport. AGENT_RUNTIME_GATEWAY_LLM_MODEL and _REASONING_EFFORT
 * select one allowed pair; an unset effort takes the model's first allowed
 * effort and an unset model the default route.
 */
const parseCodexGatewayReaderSummaryRoute = (
  env: NodeJS.ProcessEnv,
): CodexReaderSummaryRoute => {
  const model = env.AGENT_RUNTIME_GATEWAY_LLM_MODEL?.trim() || defaultCodexGatewayReaderSummaryRoute.model;
  const effort = env.AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT?.trim() ||
    codexGatewayReaderSummaryReasoningEffort(model);
  const route = codexGatewayReaderSummaryRoutes.find((candidate) =>
    candidate.model === model && candidate.reasoningEffort === effort);
  if (route === undefined) {
    throw new Error(`AGENT_RUNTIME_GATEWAY_LLM_MODEL and _REASONING_EFFORT must be one of ${
      codexGatewayReaderSummaryRoutes.map((candidate) =>
        `${candidate.model}/${candidate.reasoningEffort}`).join(", ")} for ${codexReaderSummaryBackend}`);
  }
  return route;
};

/**
 * Settings of a run that executes only on the gRPC CLI runtime: its Codex
 * identity stays the CLI one even where the process selects the gateway.
 */
export const readerSummaryCliRuntimeEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  ({ ...env, AGENT_RUNTIME_TRANSPORT: "agent-runtime" });

/** The Codex gateway route when openai-chatgpt runs on the gateway transport. */
export const resolveCodexGatewayReaderSummaryRoute = (
  env: NodeJS.ProcessEnv,
): CodexReaderSummaryRoute | undefined =>
  env.AGENT_RUNTIME_TRANSPORT?.trim() === readerSummaryGatewayTransport &&
  env.AGENT_RUNTIME_READER_SUMMARY_BACKEND?.trim() === codexReaderSummaryBackend
    ? parseCodexGatewayReaderSummaryRoute(env)
    : undefined;
