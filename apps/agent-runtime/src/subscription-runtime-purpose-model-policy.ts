import type { AgentRuntimeExecutionRequest } from "./agent-runtime-executor.port";

export const productionAgentRuntimeModel = "gpt-5.6-sol";
export const productionAgentRuntimeReasoningEffort = "xhigh";

export type SubscriptionRuntimeOutputKind =
  | "structured_output"
  | "output_text";

export type SubscriptionRuntimePurposeProfile = {
  readonly provider: "codex";
  readonly model: "gpt-5.6-sol";
  readonly reasoningEffort: "xhigh";
  readonly outputKind: SubscriptionRuntimeOutputKind;
  readonly responseFormat: "json" | "text";
};

export type AdmittedSubscriptionRuntimeRequest = {
  readonly profile: SubscriptionRuntimePurposeProfile;
  readonly canonicalRequest: Record<string, unknown>;
};

const dailyStructuredProfile = Object.freeze({
  provider: "codex",
  model: productionAgentRuntimeModel,
  reasoningEffort: productionAgentRuntimeReasoningEffort,
  outputKind: "structured_output",
  responseFormat: "json",
} as const satisfies SubscriptionRuntimePurposeProfile);

const weeklyTextProfile = Object.freeze({
  provider: "codex",
  model: "gpt-5.6-sol",
  reasoningEffort: productionAgentRuntimeReasoningEffort,
  outputKind: "output_text",
  responseFormat: "text",
} as const satisfies SubscriptionRuntimePurposeProfile);

const profilesByPurpose: Readonly<
  Record<string, SubscriptionRuntimePurposeProfile>
> = Object.freeze({
  "social_monitor.summary.generate": dailyStructuredProfile,
  "social_monitor.reader_summary.generate": dailyStructuredProfile,
  "social_monitor.reader_summary.repair": dailyStructuredProfile,
  "social_monitor.reader_summary.topic_map.label": dailyStructuredProfile,
  "social_monitor.reader_summary.topic_map.verify_relations":
    dailyStructuredProfile,
  "social_monitor.reader_summary.verify_story_relations":
    dailyStructuredProfile,
  "social_monitor.reader_summary.weekly.generate": weeklyTextProfile,
});

export const subscriptionRuntimePurposeProfiles = (): Readonly<
  Record<string, SubscriptionRuntimePurposeProfile>
> => profilesByPurpose;

export const admitSubscriptionRuntimeRequest = (
  request: AgentRuntimeExecutionRequest,
): AdmittedSubscriptionRuntimeRequest => {
  const profile = profilesByPurpose[request.purpose];
  if (profile === undefined) {
    throw new Error("Agent runtime purpose is not admitted");
  }
  if (request.provider !== profile.provider) {
    throw new Error("Agent runtime provider conflicts with purpose policy");
  }

  const controls = parseSubscriptionRuntimeJsonObject(
    request.controlsJson,
    "controls_json",
  );
  const outputSchema = parseSubscriptionRuntimeJsonObject(
    request.outputSchemaJson,
    "output_schema_json",
  );
  assertOptionalExactString(controls.model, profile.model, "model");
  assertOptionalExactString(
    request.metadata.model,
    profile.model,
    "metadata.model",
  );
  assertOptionalExactString(
    controls.reasoningEffort,
    profile.reasoningEffort,
    "reasoningEffort",
  );
  assertOptionalExactString(
    request.metadata.reasoningEffort,
    profile.reasoningEffort,
    "metadata.reasoningEffort",
  );
  assertOutputControls(request, controls, outputSchema, profile);

  const canonicalControls = canonicalControlsForProfile(
    controls,
    outputSchema,
    profile,
  );
  return {
    profile,
    canonicalRequest: {
      protocolVersion: 1,
      runId: request.requestId,
      providerInstanceId: request.providerInstanceId,
      cwd: request.cwd,
      timeoutMs: request.timeoutMs,
      task: {
        kind: "structured-prompt",
        systemPrompt: request.systemPrompt,
        prompt: request.prompt,
        outputSchemaName:
          typeof controls.outputSchemaName === "string"
            ? controls.outputSchemaName
            : undefined,
        controls: canonicalControls,
        metadata: {
          ...request.metadata,
          model: profile.model,
          reasoningEffort: profile.reasoningEffort,
          runtimeOutput: profile.outputKind,
        },
      },
      context: {
        application: "social-monitor",
        purpose: request.purpose,
        correlationId: request.correlationId,
        metadata: {
          tenantId: request.tenantId,
          workspaceId: request.workspaceId,
        },
      },
    },
  };
};

export const configuredSubscriptionRuntimeDefaultsAreSafe = (input: {
  readonly model?: string;
  readonly reasoningEffort?: string;
}): boolean =>
  (input.model ?? productionAgentRuntimeModel) === productionAgentRuntimeModel &&
  (input.reasoningEffort ?? productionAgentRuntimeReasoningEffort) ===
    productionAgentRuntimeReasoningEffort;

const canonicalControlsForProfile = (
  controls: Record<string, unknown>,
  outputSchema: Record<string, unknown>,
  profile: SubscriptionRuntimePurposeProfile,
): Record<string, unknown> => {
  const preserved = { ...controls };
  delete preserved.outputKind;
  delete preserved.outputSchema;
  delete preserved.outputSchemaJson;
  delete preserved.runtimeOutput;
  delete preserved.selectedOutputKind;
  return {
    ...preserved,
    model: profile.model,
    reasoningEffort: profile.reasoningEffort,
    responseFormat: profile.responseFormat,
    ...(profile.outputKind === "structured_output"
      ? { outputSchema }
      : {}),
  };
};

const assertOutputControls = (
  request: AgentRuntimeExecutionRequest,
  controls: Record<string, unknown>,
  outputSchema: Record<string, unknown>,
  profile: SubscriptionRuntimePurposeProfile,
): void => {
  assertOptionalExactString(
    controls.responseFormat,
    profile.responseFormat,
    "responseFormat",
  );
  for (const [label, value] of [
    ["outputKind", controls.outputKind],
    ["runtimeOutput", controls.runtimeOutput],
    ["selectedOutputKind", controls.selectedOutputKind],
    ["metadata.outputKind", request.metadata.outputKind],
    ["metadata.runtimeOutput", request.metadata.runtimeOutput],
  ] as const) {
    assertOptionalExactString(value, profile.outputKind, label);
  }

  const controlSchema = optionalControlSchema(controls);
  if (profile.outputKind === "output_text") {
    if (controlSchema !== undefined) {
      throw new Error("Text output does not admit a structured output control");
    }
    return;
  }
  if (
    controlSchema !== undefined &&
    canonicalJson(controlSchema) !== canonicalJson(outputSchema)
  ) {
    throw new Error("Structured output controls contain conflicting schemas");
  }
};

const optionalControlSchema = (
  controls: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  if (controls.outputSchema !== undefined) {
    return recordValue(controls.outputSchema, "controls.outputSchema");
  }
  if (controls.outputSchemaJson !== undefined) {
    if (typeof controls.outputSchemaJson !== "string") {
      throw new Error("controls.outputSchemaJson must be JSON text");
    }
    return parseSubscriptionRuntimeJsonObject(
      controls.outputSchemaJson,
      "controls.outputSchemaJson",
    );
  }
  return undefined;
};

const assertOptionalExactString = (
  value: unknown,
  expected: string,
  label: string,
): void => {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || value.trim() !== expected) {
    throw new Error(`${label} conflicts with purpose policy`);
  }
};

export const parseSubscriptionRuntimeJsonObject = (
  value: string,
  label: string,
): Record<string, unknown> => {
  try {
    return recordValue(JSON.parse(value) as unknown, label);
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : `${label} must be JSON`,
    );
  }
};

const recordValue = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
};

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
    return value.map(toCanonicalJsonValue);
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
