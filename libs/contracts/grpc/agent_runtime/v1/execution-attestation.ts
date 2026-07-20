import { createHash } from "node:crypto";

export const agentRuntimeExecutionAttestationSchemaVersion = 1;
export const subscriptionRuntimeEngine = "subscription-runtime-cli";

export type AgentRuntimeSelectedOutputKind =
  "structured_output" | "output_text";

export type AgentRuntimeExecutionAttestation = {
  readonly schemaVersion: typeof agentRuntimeExecutionAttestationSchemaVersion;
  readonly requestId: string;
  readonly purpose: string;
  readonly canonicalRequestSha256: string;
  readonly provider: "codex" | "claude";
  readonly model: string;
  readonly reasoningEffort: string;
  readonly runtimeEngine: typeof subscriptionRuntimeEngine;
  readonly runtimePackageVersion: string;
  readonly launcherSha256: string;
  readonly selectedOutputKind: AgentRuntimeSelectedOutputKind;
  readonly selectedOutputSha256: string;
};

export type AgentRuntimeOutputSelection = {
  readonly kind: AgentRuntimeSelectedOutputKind;
  readonly sha256: string;
};

export const canonicalJsonSha256 = (value: unknown): string =>
  sha256Utf8(canonicalJson(value));

export const selectedAgentRuntimeOutput = (result: {
  readonly structuredOutput?: Record<string, unknown>;
  readonly outputText?: string;
}): AgentRuntimeOutputSelection => {
  if (result.structuredOutput !== undefined) {
    return {
      kind: "structured_output",
      sha256: canonicalJsonSha256(result.structuredOutput),
    };
  }
  if (result.outputText !== undefined) {
    return {
      kind: "output_text",
      sha256: sha256Utf8(result.outputText),
    };
  }

  throw new Error("Completed agent runtime result has no selected output");
};

export const executionAttestationOutputMatches = (
  attestation: AgentRuntimeExecutionAttestation,
  result: {
    readonly structuredOutput?: Record<string, unknown>;
    readonly outputText?: string;
  },
): boolean => {
  try {
    const selected = selectedAgentRuntimeOutput(result);
    return (
      attestation.selectedOutputKind === selected.kind &&
      attestation.selectedOutputSha256 === selected.sha256
    );
  } catch {
    return false;
  }
};

export const isSha256Hex = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

export const isConcreteRuntimePackageVersion = (
  value: unknown,
): value is string =>
  typeof value === "string" &&
  value !== "unknown" &&
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(value);

const sha256Utf8 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const canonicalJson = (value: unknown): string =>
  JSON.stringify(toCanonicalJsonValue(value));

const toCanonicalJsonValue = (value: unknown): unknown => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Canonical JSON does not allow non-finite numbers");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      item === undefined ? null : toCanonicalJsonValue(item),
    );
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, toCanonicalJsonValue(item)]),
    );
  }

  throw new Error("Canonical JSON value is not serializable");
};
