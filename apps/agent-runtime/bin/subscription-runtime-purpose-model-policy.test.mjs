import assert from "node:assert/strict";
import test from "node:test";

/* global structuredClone */

import {
  admitSubscriptionRuntimeWrapperRequest,
  readerPromotionV2CanaryActivationCapability,
  readerPromotionV2CanaryOutputSchema,
  readerPromotionV2CanaryPurpose,
  readerPromotionV2CanarySchemaName,
  readerPromotionV2CanarySchemaVersion,
  subscriptionOnlyCodexEnvironment,
  subscriptionRuntimeWrapperPurposeProfiles,
} from "./subscription-runtime-purpose-model-policy.mjs";

test("canary purpose is private, exact-schema-only, and deeply frozen", () => {
  assert.equal(
    Object.hasOwn(
      subscriptionRuntimeWrapperPurposeProfiles(),
      readerPromotionV2CanaryPurpose,
    ),
    false,
  );
  assert.equal(everyObjectIsFrozen(readerPromotionV2CanaryOutputSchema), true);
  const input = canaryInput(readerPromotionV2CanaryOutputSchema);
  assert.throws(
    () => admitSubscriptionRuntimeWrapperRequest(input),
    /purpose is not admitted/u,
  );
  assert.throws(
    () => admitSubscriptionRuntimeWrapperRequest({
      ...input,
      request: { ...input.request, activationCapability: true },
    }),
    /purpose is not admitted/u,
  );
  assert.doesNotThrow(() => admitSubscriptionRuntimeWrapperRequest(
    input,
    readerPromotionV2CanaryActivationCapability,
  ));
  assert.throws(
    () => admitSubscriptionRuntimeWrapperRequest(
      {
        ...input,
        request: {
          ...input.request,
          task: { ...input.request.task, logicalThread: {} },
        },
      },
      readerPromotionV2CanaryActivationCapability,
    ),
    /rejects continuation/u,
  );

  for (const schema of mutatedSchemas()) {
    assert.throws(
      () => admitSubscriptionRuntimeWrapperRequest(
        canaryInput(schema),
        readerPromotionV2CanaryActivationCapability,
      ),
      /outputSchema conflicts with purpose policy/u,
    );
  }
  for (const [key, value] of [
    ["outputSchemaName", "wrong"],
    ["schemaVersion", "wrong"],
  ]) {
    const malformed = canaryInput(readerPromotionV2CanaryOutputSchema);
    malformed.request.task.controls[key] = value;
    assert.throws(
      () => admitSubscriptionRuntimeWrapperRequest(
        malformed,
        readerPromotionV2CanaryActivationCapability,
      ),
      /conflicts with purpose policy/u,
    );
  }
  const wrongTaskSchemaName = canaryInput(readerPromotionV2CanaryOutputSchema);
  wrongTaskSchemaName.request.task.outputSchemaName = "wrong";
  assert.throws(
    () => admitSubscriptionRuntimeWrapperRequest(
      wrongTaskSchemaName,
      readerPromotionV2CanaryActivationCapability,
    ),
    /task\.outputSchemaName conflicts with purpose policy/u,
  );
  for (const override of [
    { model: "gpt-5.5" },
    { reasoningEffort: "xhigh" },
  ]) {
    assert.throws(
      () => admitSubscriptionRuntimeWrapperRequest(
        { ...input, ...override },
        readerPromotionV2CanaryActivationCapability,
      ),
      /conflicts with purpose policy/u,
    );
  }
});

test("standard MJS canonical JSON bytes stay frozen for every purpose", () => {
  for (const golden of standardCanonicalGoldens) {
    const admission = admitSubscriptionRuntimeWrapperRequest(
      standardGoldenInput(golden.purpose, golden.outputKind),
    );
    assert.equal(
      JSON.stringify(admission.canonicalRequest),
      golden.bytes,
      golden.purpose,
    );
  }
});

test("active v2 admits high and rejects xhigh and every legacy reader-summary purpose", () => {
  const request = (purpose, reasoningEffort, outputKind = "structured_output") => ({
    provider: "codex",
    model: "gpt-5.6-sol",
    reasoningEffort,
    request: {
      context: { purpose },
      task: {
        controls: {
          model: "gpt-5.6-sol",
          reasoningEffort,
          ...(outputKind === "structured_output"
            ? { outputSchema: { type: "object" } }
            : {}),
          responseFormat: outputKind === "structured_output" ? "json" : "text",
        },
        metadata: { reasoningEffort, runtimeOutput: outputKind },
      },
    },
  });

  assert.doesNotThrow(() => admitSubscriptionRuntimeWrapperRequest(
    request("social_monitor.reader_summary.generate.v2", "high"),
  ));
  assert.throws(
    () => admitSubscriptionRuntimeWrapperRequest(
      request("social_monitor.reader_summary.generate.v2", "xhigh"),
    ),
    /runtime reasoning effort conflicts with purpose policy/u,
  );
  assert.doesNotThrow(() => admitSubscriptionRuntimeWrapperRequest(request(
    "social_monitor.reader_summary.daily.canonical_recovery.v2",
    "high",
    "output_text",
  )));
  assert.throws(() => admitSubscriptionRuntimeWrapperRequest(request(
    "social_monitor.reader_summary.daily.canonical_recovery.v2",
    "xhigh",
    "output_text",
  )), /runtime reasoning effort conflicts with purpose policy/u);
  for (const purpose of [
    "social_monitor.reader_summary.generate",
    "social_monitor.reader_summary.repair",
    "social_monitor.reader_summary.topic_map.label",
    "social_monitor.reader_summary.topic_map.verify_relations",
    "social_monitor.reader_summary.verify_story_relations",
    "social_monitor.reader_summary.verify_related_topic_relations",
    "social_monitor.reader_summary.weekly.review",
    "social_monitor.reader_summary.weekly.generate",
  ]) {
    assert.throws(
      () => admitSubscriptionRuntimeWrapperRequest(request(purpose, "xhigh")),
      /purpose is not admitted/u,
    );
  }
});

test("Codex subprocess environment admits only safe execution basics", () => {
  const safeEnvironment = {
    PATH: "/usr/local/bin:/usr/bin:/bin",
    LANG: "C.UTF-8",
    LANGUAGE: "en_US:en",
    LC_ALL: "C.UTF-8",
    LC_CTYPE: "C.UTF-8",
    LC_MESSAGES: "C.UTF-8",
    TMPDIR: "/tmp/runtime",
    TMP: "/tmp/runtime",
    TEMP: "/tmp/runtime",
    SSL_CERT_FILE: "/etc/ssl/certs/ca-certificates.crt",
    SSL_CERT_DIR: "/etc/ssl/certs",
    NODE_EXTRA_CA_CERTS: "/etc/ssl/certs/private-ca.pem",
  };
  const injectedEnvironment = {
    ...safeEnvironment,
    DATABASE_URL: "postgresql://redacted.invalid/database",
    AGENT_RUNTIME_SERVICE_TOKEN: "redacted-service-token",
    SUBSCRIPTION_RUNTIME_LOCAL_ENCRYPTION_KEY: "redacted-key",
    AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT: "/run/private/auth-pool",
    AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST: "current.json",
    CODEX_AUTH_JSON_PATH: "/run/private/auth.json",
    OPENAI_API_KEY: "redacted-api-key",
    AWS_ACCESS_KEY_ID: "redacted-access-key",
    SESSION_SECRET: "redacted-secret",
    PROVIDER_TOKEN: "redacted-token",
    DATABASE_PASSWORD: "redacted-password",
    CLIENT_CREDENTIAL_FILE: "/run/private/credential",
    CALLBACK_URL: "https://redacted.invalid/callback",
    HTTP_PROXY: "http://redacted.invalid:8080",
    HTTPS_PROXY: "http://redacted.invalid:8080",
    ALL_PROXY: "socks5://redacted.invalid:1080",
    NO_PROXY: "localhost",
    HOME: "/run/private/home",
    NODE_OPTIONS: "--require=/tmp/injected.cjs",
    LD_PRELOAD: "/tmp/injected.so",
    LC_SECRET: "redacted-locale-injection",
    PATH_URL: "https://redacted.invalid/path",
    __proto__: { polluted: true },
  };

  assert.deepEqual(
    subscriptionOnlyCodexEnvironment(injectedEnvironment),
    safeEnvironment,
  );
  assert.equal({}.polluted, undefined);
});

const canaryInput = (schema) => ({
  provider: "codex",
  model: "gpt-5.6-sol",
  reasoningEffort: "high",
  request: {
    context: { purpose: readerPromotionV2CanaryPurpose },
    task: {
      outputSchemaName: readerPromotionV2CanarySchemaName,
      controls: {
        outputSchemaName: readerPromotionV2CanarySchemaName,
        schemaVersion: readerPromotionV2CanarySchemaVersion,
        outputSchema: schema,
      },
      metadata: {},
    },
  },
});

const structuredBytes = (
  purpose,
  schemaName = "golden-schema",
  schemaVersion = "golden.v1",
  metadataMarkers = "",
) =>
  `{"protocolVersion":1,"runId":"golden-run","task":{"kind":"structured-prompt","outputSchemaName":"${schemaName}","controls":{"outputSchemaName":"${schemaName}","schemaVersion":"${schemaVersion}","outputSchema":{"type":"object"},"model":"gpt-5.6-sol","reasoningEffort":"REASONING","responseFormat":"json"},"metadata":{"marker":"kept","outputKind":"structured_output","runtimeOutput":"structured_output"${metadataMarkers},"model":"gpt-5.6-sol","reasoningEffort":"REASONING"}},"context":{"purpose":"${purpose}"}}`;

const textBytes = (purpose) =>
  `{"protocolVersion":1,"runId":"golden-run","task":{"kind":"structured-prompt","outputSchemaName":"golden-schema","controls":{"outputSchemaName":"golden-schema","schemaVersion":"golden.v1","model":"gpt-5.6-sol","reasoningEffort":"high","responseFormat":"text"},"metadata":{"marker":"kept","outputKind":"output_text","runtimeOutput":"output_text","model":"gpt-5.6-sol","reasoningEffort":"high"}},"context":{"purpose":"${purpose}"}}`;

const standardCanonicalGoldens = [
  ["social_monitor.summary.generate", "xhigh"],
  ["social_monitor.reader_summary.generate.v2", "high"],
  ["social_monitor.reader_summary.repair.v2", "high"],
  ["social_monitor.reader_summary.topic_map.label.v2", "high"],
  ["social_monitor.reader_summary.topic_map.verify_relations.v2", "high"],
  ["social_monitor.reader_summary.verify_story_relations.v2", "high"],
  ["social_monitor.reader_summary.weekly.review.v2", "high"],
].map(([purpose, effort]) => ({
  purpose,
  outputKind: "structured_output",
  bytes: structuredBytes(purpose).replaceAll("REASONING", effort),
}));
standardCanonicalGoldens.push({
  purpose: "social_monitor.reader_summary.verify_related_topic_relations.v2",
  outputKind: "structured_output",
  bytes: structuredBytes(
    "social_monitor.reader_summary.verify_related_topic_relations.v2",
    "social_monitor_reader_summary_related_topic_relations",
    "reader_summary.related_topic_relation.v1",
    ",\"taskRole\":\"related_topic_relation\",\"verificationLane\":\"related_topic\"",
  ).replaceAll("REASONING", "high"),
});
for (const purpose of [
  "social_monitor.reader_summary.daily.canonical_recovery.v2",
  "social_monitor.reader_summary.weekly.generate.v2",
]) {
  standardCanonicalGoldens.push({
    purpose,
    outputKind: "output_text",
    bytes: textBytes(purpose),
  });
}

const standardGoldenInput = (purpose, outputKind) => {
  const related = purpose ===
    "social_monitor.reader_summary.verify_related_topic_relations.v2";
  const schemaName = related
    ? "social_monitor_reader_summary_related_topic_relations"
    : "golden-schema";
  return {
    provider: "codex",
    request: {
      protocolVersion: 1,
      runId: "golden-run",
      task: {
        kind: "structured-prompt",
        outputSchemaName: schemaName,
        controls: {
          outputSchemaName: schemaName,
          schemaVersion: related
            ? "reader_summary.related_topic_relation.v1"
            : "golden.v1",
          ...(outputKind === "structured_output"
            ? { outputSchema: { type: "object" } }
            : {}),
          outputKind,
          runtimeOutput: outputKind,
          selectedOutputKind: outputKind,
        },
        metadata: {
          marker: "kept",
          outputKind,
          runtimeOutput: outputKind,
          ...(related
            ? {
                taskRole: "related_topic_relation",
                verificationLane: "related_topic",
              }
            : {}),
        },
      },
      context: { purpose },
    },
  };
};

const mutatedSchemas = () => {
  const extra = structuredClone(readerPromotionV2CanaryOutputSchema);
  extra.extra = true;
  const missing = structuredClone(readerPromotionV2CanaryOutputSchema);
  delete missing.properties.decisions;
  const nested = structuredClone(readerPromotionV2CanaryOutputSchema);
  nested.properties.decisions.items.properties.sameStory = { type: "string" };
  return [extra, missing, nested];
};

const everyObjectIsFrozen = (value) =>
  value === null || typeof value !== "object" ||
  (Object.isFrozen(value) && Object.values(value).every(everyObjectIsFrozen));
