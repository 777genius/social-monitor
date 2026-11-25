import { mimoSummaryBackend } from "./subscription-runtime-purpose-model-policy";

export type AllowedModelBackend = "openai-chatgpt" | typeof mimoSummaryBackend;

const knownBackends: readonly AllowedModelBackend[] = ["openai-chatgpt", mimoSummaryBackend];

// An unset value preserves the established Codex-pool service, including its
// existing MiMo route. Only an explicit MiMo-only selection removes Codex.
export const resolveAllowedModelBackends = (value: string | undefined): readonly AllowedModelBackend[] => {
  if (value === undefined) return knownBackends;
  const entries = value.split(",");
  if (entries.length < 1 || entries.length > knownBackends.length ||
      entries.some((entry) => !knownBackends.includes(entry as AllowedModelBackend)) ||
      new Set(entries).size !== entries.length) {
    throw new Error("AGENT_RUNTIME_ALLOWED_MODEL_BACKENDS must list distinct known backends");
  }
  return entries as AllowedModelBackend[];
};

export const isMimoOnly = (allowed: readonly AllowedModelBackend[]): boolean =>
  allowed.length === 1 && allowed[0] === mimoSummaryBackend;

export const admitModelBackend = (
  modelBackend: typeof mimoSummaryBackend | undefined,
  allowed: readonly AllowedModelBackend[],
): void => {
  if (!allowed.includes(modelBackend ?? "openai-chatgpt")) {
    throw new Error("Agent runtime model backend is not admitted by this service");
  }
};
