import canaryContract from "./reader-promotion-v2-canary-contract.cjs";

const {
  readerPromotionV2CanaryOutputIsValid,
  readerPromotionV2CanaryOutputSchema,
  readerPromotionV2CanaryPurpose,
  readerPromotionV2CanarySchemaEquals,
  readerPromotionV2CanarySchemaName,
  readerPromotionV2CanarySchemaVersion,
} = canaryContract;

export {
  readerPromotionV2CanaryOutputIsValid,
  readerPromotionV2CanaryOutputSchema,
  readerPromotionV2CanaryPurpose,
  readerPromotionV2CanarySchemaName,
  readerPromotionV2CanarySchemaVersion,
};

export const readerPromotionV2CanaryActivationCapability = Symbol(
  "reader-promotion-v2-canary-activation-capability",
);

const genericSummaryStructuredProfile = Object.freeze({
  provider: "codex",
  model: "gpt-5.6-sol",
  reasoningEffort: "xhigh",
  outputKind: "structured_output",
  responseFormat: "json",
});

const activeReaderSummaryStructuredProfile = Object.freeze({
  provider: "codex",
  model: "gpt-5.6-sol",
  reasoningEffort: "high",
  outputKind: "structured_output",
  responseFormat: "json",
});

const mimoReaderSummaryStructuredProfile = Object.freeze({
  provider: "codex",
  model: "mimo-v2.6-pro",
  modelBackend: "xiaomi-mimo-token-plan",
  reasoningEffort: "high",
  outputKind: "structured_output",
  responseFormat: "json",
  retryMode: "never",
});

const mimoSummaryPurposes = new Set([
  "social_monitor.reader_summary.generate.v2",
  "social_monitor.reader_summary.repair.v2",
  "social_monitor.reader_summary.topic_map.label.v2",
  "social_monitor.reader_summary.topic_map.verify_relations.v2",
  "social_monitor.reader_summary.verify_story_relations.v2",
  "social_monitor.reader_summary.verify_related_topic_relations.v2",
]);

const mimoSchemaMarkers = Object.freeze({
  "social_monitor.reader_summary.generate.v2": ["social_monitor_reader_summary_artifact", "reader_summary.artifact.v1"],
  "social_monitor.reader_summary.repair.v2": ["social_monitor_reader_summary_artifact", "reader_summary.artifact.v1"],
  "social_monitor.reader_summary.topic_map.label.v2": ["social_monitor_reader_summary_topic_map_labels", "reader_summary.topic_map.v1"],
  "social_monitor.reader_summary.topic_map.verify_relations.v2": ["social_monitor_reader_summary_topic_relations", "reader_summary.topic_relation.v1"],
  "social_monitor.reader_summary.verify_story_relations.v2": ["social_monitor_reader_summary_story_relations", "reader_summary.story_relation.v1"],
  "social_monitor.reader_summary.verify_related_topic_relations.v2": ["social_monitor_reader_summary_related_topic_relations", "reader_summary.related_topic_relation.v1"],
});
const mimoRootProperties = Object.freeze({
  "social_monitor.reader_summary.generate.v2": ["headline", "executiveSummary", "narrativeSections", "content", "topStories", "interestHighlights", "repeatedSignals", "risksAndUnknowns", "citationMap", "qualityFlags", "confidence", "noSignalReason"],
  "social_monitor.reader_summary.repair.v2": ["headline", "executiveSummary", "narrativeSections", "content", "topStories", "interestHighlights", "repeatedSignals", "risksAndUnknowns", "citationMap", "qualityFlags", "confidence", "noSignalReason"],
  "social_monitor.reader_summary.topic_map.label.v2": ["nodeLabels", "groups"],
  "social_monitor.reader_summary.topic_map.verify_relations.v2": ["decisions"],
  "social_monitor.reader_summary.verify_story_relations.v2": ["decisions"],
  "social_monitor.reader_summary.verify_related_topic_relations.v2": ["decisions"],
});

const activeReaderSummaryTextProfile = Object.freeze({
  provider: "codex",
  model: "gpt-5.6-sol",
  reasoningEffort: "high",
  outputKind: "output_text",
  responseFormat: "text",
});

const sourceContentAssessmentStructuredProfile = Object.freeze({
  ...activeReaderSummaryStructuredProfile,
  reasoningEffort: "low",
  retryMode: "never",
});

const readerPromotionV2CanaryProfile = Object.freeze({
  provider: "codex",
  model: "gpt-5.6-sol",
  reasoningEffort: "high",
  outputKind: "structured_output",
  responseFormat: "json",
  retryMode: "never",
});

const profilesByPurpose = Object.freeze({
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
  "social_monitor.reader_summary.promotion_presentation.v3":
    activeReaderSummaryStructuredProfile,
  "social_monitor.reader_summary.daily.canonical_recovery.v2":
    activeReaderSummaryTextProfile,
  "social_monitor.reader_summary.weekly.review.v2": activeReaderSummaryStructuredProfile,
  "social_monitor.reader_summary.weekly.generate.v2": activeReaderSummaryTextProfile,
});

const capabilityProfilesByPurpose = Object.freeze({
  [readerPromotionV2CanaryPurpose]: readerPromotionV2CanaryProfile,
});

export const subscriptionRuntimeWrapperPurposeProfiles = () =>
  profilesByPurpose;

export const admitSubscriptionRuntimeWrapperRequest = (
  input,
  activationCapability,
) => {
  const request = record(input.request, "request");
  const context = record(request.context, "request.context");
  const task = record(request.task, "request.task");
  const controls = optionalRecord(task.controls, "request.task.controls") ?? {};
  const metadata = optionalRecord(task.metadata, "request.task.metadata") ?? {};
  const purpose = nonEmptyString(context.purpose, "request.context.purpose");
  const profile = controls.modelBackend === "xiaomi-mimo-token-plan" &&
    mimoSummaryPurposes.has(purpose)
    ? mimoReaderSummaryStructuredProfile
    : profilesByPurpose[purpose] ??
      (activationCapability === readerPromotionV2CanaryActivationCapability
        ? capabilityProfilesByPurpose[purpose]
        : undefined);
  if (profile === undefined) {
    throw new Error("Agent runtime purpose is not admitted");
  }
  if (input.provider !== profile.provider) {
    throw new Error("Agent runtime provider conflicts with purpose policy");
  }

  assertOptionalExactString(input.model, profile.model, "CLI model");
  assertOptionalExactString(controls.model, profile.model, "model");
  assertOptionalExactString(
    controls.modelBackend,
    profile.modelBackend ?? "openai-chatgpt",
    "modelBackend",
  );
  assertOptionalExactString(
    metadata.modelBackend,
    profile.modelBackend ?? "openai-chatgpt",
    "metadata.modelBackend",
  );
  assertOptionalExactString(metadata.model, profile.model, "metadata.model");
  assertOptionalExactString(
    input.reasoningEffort,
    profile.reasoningEffort,
    "runtime reasoning effort",
  );
  assertOptionalExactString(
    controls.reasoningEffort,
    profile.reasoningEffort,
    "reasoningEffort",
  );
  assertOptionalExactString(
    metadata.reasoningEffort,
    profile.reasoningEffort,
    "metadata.reasoningEffort",
  );
  assertDedicatedRelatedTopicMarkers(purpose, controls, metadata);
  if (profile.modelBackend === "xiaomi-mimo-token-plan") {
    const markers = mimoSchemaMarkers[purpose];
    if (markers === undefined) throw new Error("MiMo purpose is not admitted");
    assertRequiredExactString(task.outputSchemaName, markers[0], "task.outputSchemaName");
    assertRequiredExactString(controls.outputSchemaName, markers[0], "outputSchemaName");
    assertRequiredExactString(controls.schemaVersion, markers[1], "schemaVersion");
    assertOptionalExactString(controls.toolPolicy, "none", "toolPolicy");
    if (controls.toolsEnabled !== undefined && controls.toolsEnabled !== false) {
      throw new Error("toolsEnabled conflicts with purpose policy");
    }
  }
  assertReaderPromotionV2CanaryMarkers(purpose, task, controls);
  assertOptionalExactString(
    controls.responseFormat,
    profile.responseFormat,
    "responseFormat",
  );
  for (const [label, value] of [
    ["outputKind", controls.outputKind],
    ["runtimeOutput", controls.runtimeOutput],
    ["selectedOutputKind", controls.selectedOutputKind],
    ["metadata.outputKind", metadata.outputKind],
    ["metadata.runtimeOutput", metadata.runtimeOutput],
  ]) {
    assertOptionalExactString(value, profile.outputKind, label);
  }

  const outputSchema = controls.outputSchema;
  if (profile.outputKind === "structured_output") {
    record(outputSchema, "request.task.controls.outputSchema");
    if (profile.modelBackend === "xiaomi-mimo-token-plan") {
      assertMimoSchemaRoot(purpose, outputSchema);
    }
  } else if (
    outputSchema !== undefined ||
    controls.outputSchemaJson !== undefined
  ) {
    throw new Error("Text output does not admit a structured output control");
  }

  const preservedControls = { ...controls };
  const canonicalTask = { ...task };
  delete preservedControls.outputKind;
  delete preservedControls.outputSchemaJson;
  delete preservedControls.runtimeOutput;
  delete preservedControls.selectedOutputKind;
  if (profile.outputKind === "output_text") {
    delete preservedControls.outputSchemaName;
    delete canonicalTask.outputSchemaName;
  }
  return {
    profile,
    canonicalRequest: {
      ...request,
      task: {
        ...canonicalTask,
        controls: {
          ...preservedControls,
          model: profile.model,
          ...(profile.modelBackend === undefined
            ? {}
            : { modelBackend: profile.modelBackend }),
          reasoningEffort: profile.reasoningEffort,
          responseFormat: profile.responseFormat,
        },
        metadata: {
          ...metadata,
          model: profile.model,
          reasoningEffort: profile.reasoningEffort,
          runtimeOutput: profile.outputKind,
        },
      },
    },
  };
};

const assertMimoSchemaRoot = (purpose, schema) => {
  const expected = mimoRootProperties[purpose];
  const properties = schema.properties;
  const required = schema.required;
  if (expected === undefined || schema.type !== "object" ||
      schema.additionalProperties !== false ||
      properties === null || typeof properties !== "object" || Array.isArray(properties) ||
      !Array.isArray(required) || required.length !== expected.length ||
      expected.some((key) => !required.includes(key) || !Object.hasOwn(properties, key))) {
    throw new Error("outputSchema conflicts with MiMo purpose policy");
  }
  const firstProperty = properties[expected[0]];
  const expectedType = expected[0] === "headline" ? "string" : "array";
  if (firstProperty === null || typeof firstProperty !== "object" ||
      Array.isArray(firstProperty) || firstProperty.type !== expectedType) {
    throw new Error("outputSchema conflicts with MiMo purpose policy");
  }
};

const assertReaderPromotionV2CanaryMarkers = (purpose, task, controls) => {
  if (purpose !== readerPromotionV2CanaryPurpose) return;
  assertRequiredExactString(
    task.outputSchemaName,
    readerPromotionV2CanarySchemaName,
    "task.outputSchemaName",
  );
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
  if (!readerPromotionV2CanarySchemaEquals(controls.outputSchema)) {
    throw new Error("outputSchema conflicts with purpose policy");
  }
  for (const container of [task, controls]) {
    for (const key of [
      "continuation",
      "logicalThread",
      "previousCheckpoint",
      "recoveryPacket",
      "resumeHandle",
    ]) {
      if (Object.hasOwn(container, key)) {
        throw new Error("Reader promotion V2 canary rejects continuation");
      }
    }
  }
};

const assertDedicatedRelatedTopicMarkers = (purpose, controls, metadata) => {
  if (
    purpose !== "social_monitor.reader_summary.verify_related_topic_relations.v2"
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
    metadata.taskRole,
    "related_topic_relation",
    "metadata.taskRole",
  );
  assertRequiredExactString(
    metadata.verificationLane,
    "related_topic",
    "metadata.verificationLane",
  );
};

const assertRequiredExactString = (value, expected, label) => {
  if (value !== expected) {
    throw new Error(`${label} conflicts with purpose policy`);
  }
};

const codexSubprocessEnvironmentKeys = new Set([
  "LANG",
  "LANGUAGE",
  "LC_ADDRESS",
  "LC_ALL",
  "LC_COLLATE",
  "LC_CTYPE",
  "LC_IDENTIFICATION",
  "LC_MEASUREMENT",
  "LC_MESSAGES",
  "LC_MONETARY",
  "LC_NAME",
  "LC_NUMERIC",
  "LC_PAPER",
  "LC_TELEPHONE",
  "LC_TIME",
  "NODE_EXTRA_CA_CERTS",
  "PATH",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "TEMP",
  "TMP",
  "TMPDIR",
]);

const sensitiveEnvironmentKeyFragment =
  /(CREDENTIAL|KEY|PASSWORD|SECRET|TOKEN|URL)/u;

export const subscriptionOnlyCodexEnvironment = (env) =>
  Object.fromEntries(
    Object.entries(env).filter(
      ([key, value]) =>
        value !== undefined &&
        codexSubprocessEnvironmentKeys.has(key) &&
        !sensitiveEnvironmentKeyFragment.test(key),
    ),
  );

const assertOptionalExactString = (value, expected, label) => {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || value.trim() !== expected) {
    throw new Error(`${label} conflicts with purpose policy`);
  }
};

const nonEmptyString = (value, label) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be non-empty`);
  }
  return value.trim();
};

const optionalRecord = (value, label) =>
  value === undefined ? undefined : record(value, label);

const record = (value, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
};
