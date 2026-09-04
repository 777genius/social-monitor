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

const activeReaderSummaryTextProfile = Object.freeze({
  provider: "codex",
  model: "gpt-5.6-sol",
  reasoningEffort: "high",
  outputKind: "output_text",
  responseFormat: "text",
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
  const profile = profilesByPurpose[purpose] ??
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
