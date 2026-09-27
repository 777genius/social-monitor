import type { AgentRuntimeExecutionRequest } from "./agent-runtime-executor.port";
import {
  readerPromotionV2CanaryOutputIsValid,
  readerPromotionV2CanaryOutputSchema,
  readerPromotionV2CanaryPurpose,
  readerPromotionV2CanarySchemaEquals,
  readerPromotionV2CanarySchemaName,
  readerPromotionV2CanarySchemaVersion,
} from "./reader-promotion-v2-canary-contract";

export const productionAgentRuntimeModel = "gpt-5.6-sol";
export const productionAgentRuntimeReasoningEffort = "xhigh";
export const activeReaderSummaryReasoningEffort = "high";
export const mimoSummaryModel = "mimo-v2.6-pro";
export const mimoSummaryBackend = "xiaomi-mimo-token-plan";

export type SubscriptionRuntimeOutputKind =
  | "structured_output"
  | "output_text";
export type SubscriptionRuntimeRetryMode = "standard" | "never";

export type SubscriptionRuntimePurposeProfile = {
  readonly provider: "codex";
  readonly model: "gpt-5.6-sol" | typeof mimoSummaryModel;
  readonly modelBackend?: typeof mimoSummaryBackend;
  readonly reasoningEffort: "low" | "high" | "xhigh";
  readonly outputKind: SubscriptionRuntimeOutputKind;
  readonly responseFormat: "json" | "text";
  readonly retryMode?: SubscriptionRuntimeRetryMode;
};

export const readerPromotionV2CanaryActivationCapability = Symbol(
  "reader-promotion-v2-canary-activation-capability",
);

export {
  readerPromotionV2CanaryOutputSchema,
  readerPromotionV2CanaryPurpose,
  readerPromotionV2CanarySchemaName,
  readerPromotionV2CanarySchemaVersion,
};

export type AdmittedSubscriptionRuntimeRequest = {
  readonly profile: SubscriptionRuntimePurposeProfile;
  readonly canonicalRequest: Record<string, unknown>;
};

const genericSummaryStructuredProfile = Object.freeze({
  provider: "codex",
  model: productionAgentRuntimeModel,
  reasoningEffort: productionAgentRuntimeReasoningEffort,
  outputKind: "structured_output",
  responseFormat: "json",
} as const satisfies SubscriptionRuntimePurposeProfile);

const activeReaderSummaryStructuredProfile = Object.freeze({
  provider: "codex",
  model: productionAgentRuntimeModel,
  reasoningEffort: activeReaderSummaryReasoningEffort,
  outputKind: "structured_output",
  responseFormat: "json",
} as const satisfies SubscriptionRuntimePurposeProfile);

const mimoReaderSummaryStructuredProfile = Object.freeze({
  provider: "codex",
  model: mimoSummaryModel,
  modelBackend: mimoSummaryBackend,
  reasoningEffort: activeReaderSummaryReasoningEffort,
  outputKind: "structured_output",
  responseFormat: "json",
  retryMode: "never",
} as const satisfies SubscriptionRuntimePurposeProfile);

const artifactRoot = ["headline", "executiveSummary", "narrativeSections", "content", "topStories", "interestHighlights", "repeatedSignals", "risksAndUnknowns", "citationMap", "qualityFlags", "confidence", "noSignalReason"];
const mimoSchemaMarkers: Readonly<Record<string, readonly [string, string, readonly string[]]>> = Object.freeze({
  "social_monitor.reader_summary.generate.v2": ["social_monitor_reader_summary_artifact", "reader_summary.artifact.v1", artifactRoot],
  "social_monitor.reader_summary.repair.v2": ["social_monitor_reader_summary_artifact", "reader_summary.artifact.v1", artifactRoot],
  "social_monitor.reader_summary.topic_map.label.v2": ["social_monitor_reader_summary_topic_map_labels", "reader_summary.topic_map.v1", ["nodeLabels", "groups"]],
  "social_monitor.reader_summary.topic_map.verify_relations.v2": ["social_monitor_reader_summary_topic_relations", "reader_summary.topic_relation.v1", ["decisions"]],
  "social_monitor.reader_summary.verify_story_relations.v2": ["social_monitor_reader_summary_story_relations", "reader_summary.story_relation.v1", ["decisions"]],
  "social_monitor.reader_summary.verify_related_topic_relations.v2": ["social_monitor_reader_summary_related_topic_relations", "reader_summary.related_topic_relation.v1", ["decisions"]],
});
const profileForRequest = (
  purpose: string,
  modelBackend: unknown,
  activationCapability?: symbol,
): SubscriptionRuntimePurposeProfile | undefined => {
  if (modelBackend === mimoSummaryBackend && Object.hasOwn(mimoSchemaMarkers, purpose)) {
    return mimoReaderSummaryStructuredProfile;
  }
  return profilesByPurpose[purpose] ??
    (activationCapability === readerPromotionV2CanaryActivationCapability
      ? capabilityProfilesByPurpose[purpose]
      : undefined);
};
const activeReaderSummaryTextProfile = Object.freeze({
  provider: "codex",
  model: productionAgentRuntimeModel,
  reasoningEffort: activeReaderSummaryReasoningEffort,
  outputKind: "output_text",
  responseFormat: "text",
} as const satisfies SubscriptionRuntimePurposeProfile);

const sourceContentAssessmentStructuredProfile = Object.freeze({
  ...activeReaderSummaryStructuredProfile,
  reasoningEffort: "low",
  retryMode: "never",
} as const satisfies SubscriptionRuntimePurposeProfile);

const readerPromotionV2CanaryProfile = Object.freeze({
  provider: "codex",
  model: productionAgentRuntimeModel,
  reasoningEffort: activeReaderSummaryReasoningEffort,
  outputKind: "structured_output",
  responseFormat: "json",
  retryMode: "never",
} as const satisfies SubscriptionRuntimePurposeProfile);

const profilesByPurpose: Readonly<
  Record<string, SubscriptionRuntimePurposeProfile>
> = Object.freeze({
  "social_monitor.relevance.assess_source_content.v1":
    sourceContentAssessmentStructuredProfile,
  "social_monitor.summary.generate": genericSummaryStructuredProfile,
  "social_monitor.reader_summary.generate.v2": activeReaderSummaryStructuredProfile,
  "social_monitor.reader_summary.repair.v2": activeReaderSummaryStructuredProfile,
  "social_monitor.reader_summary.topic_map.label.v2": activeReaderSummaryStructuredProfile,
  "social_monitor.reader_summary.topic_map.verify_relations.v2":
    activeReaderSummaryStructuredProfile,
  "social_monitor.reader_summary.verify_story_relations.v2":
    activeReaderSummaryStructuredProfile,
  "social_monitor.reader_summary.verify_related_topic_relations.v2":
    activeReaderSummaryStructuredProfile,
  "social_monitor.reader_summary.daily.canonical_recovery.v2":
    activeReaderSummaryTextProfile,
  "social_monitor.reader_summary.weekly.review.v2": activeReaderSummaryStructuredProfile,
  "social_monitor.reader_summary.weekly.generate.v2": activeReaderSummaryTextProfile,
});

const capabilityProfilesByPurpose: Readonly<
  Record<string, SubscriptionRuntimePurposeProfile>
> = Object.freeze({
  [readerPromotionV2CanaryPurpose]: readerPromotionV2CanaryProfile,
});

export const subscriptionRuntimePurposeProfiles = (): Readonly<
  Record<string, SubscriptionRuntimePurposeProfile>
> => profilesByPurpose;

export const admitSubscriptionRuntimeRequest = (
  request: AgentRuntimeExecutionRequest,
  activationCapability?: symbol,
): AdmittedSubscriptionRuntimeRequest => {
  const controls = parseSubscriptionRuntimeJsonObject(
    request.controlsJson,
    "controls_json",
  );
  const profile = profileForRequest(
    request.purpose,
    controls.modelBackend,
    activationCapability,
  );
  if (profile === undefined) {
    throw new Error("Agent runtime purpose is not admitted");
  }
  if (request.provider !== profile.provider) {
    throw new Error("Agent runtime provider conflicts with purpose policy");
  }

  const outputSchema = parseSubscriptionRuntimeJsonObject(
    request.outputSchemaJson,
    "output_schema_json",
  );
  assertOptionalExactString(controls.model, profile.model, "model");
  assertOptionalExactString(controls.modelBackend, profile.modelBackend ?? "openai-chatgpt", "modelBackend");
  assertOptionalExactString(request.metadata.modelBackend, profile.modelBackend ?? "openai-chatgpt", "metadata.modelBackend");
  assertOptionalExactString(request.metadata.model, profile.model, "metadata.model");
  assertOptionalExactString(controls.reasoningEffort, profile.reasoningEffort, "reasoningEffort");
  assertOptionalExactString(request.metadata.reasoningEffort, profile.reasoningEffort, "metadata.reasoningEffort");
  assertDedicatedRelatedTopicMarkers(request, controls);
  if (profile.modelBackend === mimoSummaryBackend) {
    const markers = mimoSchemaMarkers[request.purpose];
    if (markers === undefined) throw new Error("MiMo purpose is not admitted");
    assertOptionalExactString(controls.toolPolicy, "none", "toolPolicy");
    if (controls.toolsEnabled !== undefined && controls.toolsEnabled !== false) throw new Error("toolsEnabled conflicts with purpose policy");
    if (!(["social_monitor.reader_summary.generate.v2", "social_monitor.reader_summary.repair.v2"].includes(request.purpose) && controls.outputSchemaName === undefined)) {
      assertRequiredExactString(controls.outputSchemaName, markers[0], "outputSchemaName");
      assertRequiredExactString(controls.schemaVersion, markers[1], "schemaVersion");
      assertMimoSchemaRoot(request.purpose, outputSchema);
    }
  }
  assertReaderPromotionV2CanaryMarkers(request, controls, outputSchema);
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
        ...(profile.outputKind === "structured_output"
          ? {
              outputSchemaName:
                typeof controls.outputSchemaName === "string"
                  ? controls.outputSchemaName
                  : undefined,
            }
          : {}),
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

const assertMimoSchemaRoot = (
  purpose: string,
  schema: Record<string, unknown>,
): void => {
  const expected = mimoSchemaMarkers[purpose]?.[2];
  const properties = schema.properties as Record<string, unknown> | undefined;
  const required = schema.required as readonly string[] | undefined;
  const first = expected?.[0];
  const firstSchema = first === undefined ? undefined : properties?.[first] as Record<string, unknown> | undefined;
  if (expected === undefined || schema.type !== "object" || schema.additionalProperties !== false ||
    !properties || Array.isArray(properties) || !Array.isArray(required) ||
    required.length !== expected?.length ||
    expected.some((key) => !required.includes(key) || !Object.hasOwn(properties, key)) ||
    firstSchema?.type !== (first === "headline" ? "string" : "array")) {
    throw new Error("outputSchema conflicts with MiMo purpose policy");
  }
};

export const subscriptionRuntimeOutputMatchesProfile = (
  admission: AdmittedSubscriptionRuntimeRequest,
  structuredOutput: Readonly<Record<string, unknown>> | undefined,
): boolean =>
  admission.profile !== readerPromotionV2CanaryProfile ||
  readerPromotionV2CanaryOutputIsValid(structuredOutput);

const assertDedicatedRelatedTopicMarkers = (
  request: AgentRuntimeExecutionRequest,
  controls: Record<string, unknown>,
): void => {
  if (
    request.purpose !==
      "social_monitor.reader_summary.verify_related_topic_relations.v2"
  ) return;
  assertRequiredExactString(
    controls.outputSchemaName,
    "social_monitor_reader_summary_related_topic_relations",
    "outputSchemaName",
  );
  assertRequiredExactString(
    controls.schemaVersion,
    "reader_summary.related_topic_relation.v1",
    "schemaVersion",
  );
  assertRequiredExactString(
    request.metadata.taskRole,
    "related_topic_relation",
    "metadata.taskRole",
  );
  assertRequiredExactString(
    request.metadata.verificationLane,
    "related_topic",
    "metadata.verificationLane",
  );
};

const assertReaderPromotionV2CanaryMarkers = (
  request: AgentRuntimeExecutionRequest,
  controls: Record<string, unknown>,
  outputSchema: Record<string, unknown>,
): void => {
  if (request.purpose !== readerPromotionV2CanaryPurpose) return;
  assertRequiredExactString(
    controls.outputSchemaName,
    readerPromotionV2CanarySchemaName,
    "outputSchemaName",
  );
  assertRequiredExactString(
    controls.schemaVersion,
    readerPromotionV2CanarySchemaVersion,
    "schemaVersion",
  );
  if (!readerPromotionV2CanarySchemaEquals(outputSchema)) {
    throw new Error("outputSchema conflicts with purpose policy");
  }
  assertNoCanaryContinuationControls(controls);
};

const assertNoCanaryContinuationControls = (
  controls: Record<string, unknown>,
): void => {
  for (const key of [
    "continuation",
    "logicalThread",
    "previousCheckpoint",
    "recoveryPacket",
    "resumeHandle",
  ]) {
    if (Object.hasOwn(controls, key)) {
      throw new Error("Reader promotion V2 canary rejects continuation");
    }
  }
};

const assertRequiredExactString = (
  value: unknown,
  expected: string,
  label: string,
): void => {
  if (value !== expected) {
    throw new Error(`${label} conflicts with purpose policy`);
  }
};

export const configuredSubscriptionRuntimeDefaultsAreSafe = (input: {
  readonly model?: string;
  readonly reasoningEffort?: string;
}): boolean =>
  (input.model ?? productionAgentRuntimeModel) === productionAgentRuntimeModel &&
  (input.reasoningEffort ?? activeReaderSummaryReasoningEffort) ===
    activeReaderSummaryReasoningEffort;

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
  if (profile.outputKind === "output_text") {
    delete preserved.outputSchemaName;
  }
  return {
    ...preserved,
    model: profile.model,
    ...(profile.modelBackend === undefined
      ? {}
      : { modelBackend: profile.modelBackend }),
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
