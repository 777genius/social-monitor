const dailyStructuredProfile = Object.freeze({
  provider: "codex",
  model: "gpt-5.6-sol",
  reasoningEffort: "xhigh",
  outputKind: "structured_output",
  responseFormat: "json",
});

const weeklyTextProfile = Object.freeze({
  provider: "codex",
  model: "gpt-5.6-sol",
  reasoningEffort: "xhigh",
  outputKind: "output_text",
  responseFormat: "text",
});

const profilesByPurpose = Object.freeze({
  "social_monitor.summary.generate": dailyStructuredProfile,
  "social_monitor.reader_summary.generate": dailyStructuredProfile,
  "social_monitor.reader_summary.repair": dailyStructuredProfile,
  "social_monitor.reader_summary.topic_map.label": dailyStructuredProfile,
  "social_monitor.reader_summary.topic_map.verify_relations":
    dailyStructuredProfile,
  "social_monitor.reader_summary.verify_story_relations":
    dailyStructuredProfile,
  "social_monitor.reader_summary.weekly.review": dailyStructuredProfile,
  "social_monitor.reader_summary.weekly.generate": weeklyTextProfile,
});

export const subscriptionRuntimeWrapperPurposeProfiles = () =>
  profilesByPurpose;

export const admitSubscriptionRuntimeWrapperRequest = (input) => {
  const request = record(input.request, "request");
  const context = record(request.context, "request.context");
  const task = record(request.task, "request.task");
  const controls = optionalRecord(task.controls, "request.task.controls") ?? {};
  const metadata = optionalRecord(task.metadata, "request.task.metadata") ?? {};
  const purpose = nonEmptyString(context.purpose, "request.context.purpose");
  const profile = profilesByPurpose[purpose];
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
