import { spawnSync } from "node:child_process";
import { join } from "node:path";

import type { AgentRuntimeExecutionRequest } from "./agent-runtime-executor.port";
import {
  admitSubscriptionRuntimeRequest,
  readerPromotionV2CanaryActivationCapability,
  readerPromotionV2CanaryOutputSchema,
  readerPromotionV2CanaryPurpose,
  readerPromotionV2CanarySchemaName,
  readerPromotionV2CanarySchemaVersion,
  subscriptionRuntimePurposeProfiles,
} from "./subscription-runtime-purpose-model-policy";

describe("reader promotion V2 canary admission", () => {
  it("is absent normally and needs the executor-owned capability in TS and MJS", () => {
    const input = request();
    expect(subscriptionRuntimePurposeProfiles()).not.toHaveProperty(
      readerPromotionV2CanaryPurpose,
    );
    expect(() => admitSubscriptionRuntimeRequest(input)).toThrow(
      "Agent runtime purpose is not admitted",
    );
    expect(() => admitSubscriptionRuntimeRequest(
      input,
      Symbol("request-supplied-lookalike"),
    )).toThrow("Agent runtime purpose is not admitted");

    const admission = admitSubscriptionRuntimeRequest(
      input,
      readerPromotionV2CanaryActivationCapability,
    );
    expect(admission.profile).toEqual({
      provider: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      outputKind: "structured_output",
      responseFormat: "json",
      retryMode: "never",
    });
    expect(mjsAdmission(admission.canonicalRequest, false)).toMatchObject({
      ok: false,
      error: "Agent runtime purpose is not admitted",
    });
    expect(mjsAdmission(admission.canonicalRequest, true)).toMatchObject({
      ok: true,
      profile: admission.profile,
    });
  });

  it("admits only the exact deeply frozen shared schema in TS and MJS", () => {
    expect(Object.isFrozen(readerPromotionV2CanaryOutputSchema)).toBe(true);
    expect(everyObjectIsFrozen(readerPromotionV2CanaryOutputSchema)).toBe(true);

    for (const schema of mutatedSchemas()) {
      const input = request({ outputSchemaJson: JSON.stringify(schema) });
      expect(() => admitSubscriptionRuntimeRequest(
        input,
        readerPromotionV2CanaryActivationCapability,
      )).toThrow("outputSchema conflicts with purpose policy");

      const canonical = exactAdmission().canonicalRequest;
      const task = canonical.task as Record<string, unknown>;
      const controls = task.controls as Record<string, unknown>;
      controls.outputSchema = schema;
      expect(mjsAdmission(canonical, true)).toMatchObject({ ok: false });
    }
  });

  it.each([
    ["model", { controlsJson: JSON.stringify(canaryControls({ model: "gpt-5.5" })) }],
    ["effort", { controlsJson: JSON.stringify(canaryControls({ reasoningEffort: "xhigh" })) }],
    ["schema name", { controlsJson: JSON.stringify(canaryControls({ outputSchemaName: "wrong" })) }],
    ["schema version", { controlsJson: JSON.stringify(canaryControls({ schemaVersion: "wrong" })) }],
  ])("rejects a non-exact canary %s", (_label, override) => {
    expect(() => admitSubscriptionRuntimeRequest(
      request(override),
      readerPromotionV2CanaryActivationCapability,
    )).toThrow();
  });

  it("keeps an existing-purpose canonical byte golden unchanged", () => {
    const standard = admitSubscriptionRuntimeRequest({
      ...request(),
      purpose: "social_monitor.reader_summary.generate.v2",
      outputSchemaJson: '{"type":"object"}',
      controlsJson: "{}",
      metadata: {},
    });
    expect(JSON.stringify(standard.canonicalRequest)).toBe(
      '{"protocolVersion":1,"runId":"canary-request-1","providerInstanceId":"codex:test","cwd":"/sandbox","timeoutMs":1000,"task":{"kind":"structured-prompt","systemPrompt":"Return JSON only.","prompt":"Classify story pairs.","controls":{"model":"gpt-5.6-sol","reasoningEffort":"high","responseFormat":"json","outputSchema":{"type":"object"}},"metadata":{"model":"gpt-5.6-sol","reasoningEffort":"high","runtimeOutput":"structured_output"}},"context":{"application":"social-monitor","purpose":"social_monitor.reader_summary.generate.v2","correlationId":"canary-correlation-1","metadata":{"tenantId":"tenant-1","workspaceId":"workspace-1"}}}',
    );
  });
});

const exactAdmission = () => admitSubscriptionRuntimeRequest(
  request(),
  readerPromotionV2CanaryActivationCapability,
);

const request = (
  override: Partial<AgentRuntimeExecutionRequest> = {},
): AgentRuntimeExecutionRequest => ({
  requestId: "canary-request-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  correlationId: "canary-correlation-1",
  provider: "codex",
  providerInstanceId: "codex:test",
  purpose: readerPromotionV2CanaryPurpose,
  systemPrompt: "Return JSON only.",
  prompt: "Classify story pairs.",
  outputSchemaJson: JSON.stringify(readerPromotionV2CanaryOutputSchema),
  controlsJson: JSON.stringify(canaryControls()),
  timeoutMs: 1_000,
  cwd: "/sandbox",
  metadata: {},
  ...override,
});

function canaryControls(override: Record<string, unknown> = {}) {
  return {
    outputSchemaName: readerPromotionV2CanarySchemaName,
    schemaVersion: readerPromotionV2CanarySchemaVersion,
    ...override,
  };
}

const mutatedSchemas = (): readonly Record<string, unknown>[] => {
  const extra = structuredClone(
    readerPromotionV2CanaryOutputSchema,
  ) as Record<string, unknown>;
  extra.extra = true;
  const missing = structuredClone(
    readerPromotionV2CanaryOutputSchema,
  ) as Record<string, unknown>;
  delete (missing.properties as Record<string, unknown>).decisions;
  const nested = structuredClone(
    readerPromotionV2CanaryOutputSchema,
  ) as Record<string, unknown>;
  const decision = ((nested.properties as Record<string, unknown>).decisions as
    Record<string, unknown>).items as Record<string, unknown>;
  (decision.properties as Record<string, unknown>).sameStory = {
    type: "string",
  };
  return [extra, missing, nested];
};

const everyObjectIsFrozen = (value: unknown): boolean => {
  if (value === null || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(everyObjectIsFrozen);
};

const mjsAdmission = (
  canonicalRequest: Record<string, unknown>,
  activate: boolean,
): unknown => {
  const policyPath = join(
    __dirname,
    "../bin/subscription-runtime-purpose-model-policy.mjs",
  );
  const expression = [
    'import { pathToFileURL } from "node:url";',
    "const policy = await import(pathToFileURL(process.argv[1]).href);",
    "const input = JSON.parse(process.argv[2]);",
    "try {",
    " const value = policy.admitSubscriptionRuntimeWrapperRequest(input, input.activate ? policy.readerPromotionV2CanaryActivationCapability : undefined);",
    " process.stdout.write(JSON.stringify({ ok: true, ...value }));",
    "} catch (error) {",
    " process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));",
    "}",
  ].join("\n");
  const result = spawnSync(process.execPath, [
    "--input-type=module",
    "--eval",
    expression,
    policyPath,
    JSON.stringify({
      request: canonicalRequest,
      provider: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      activate,
    }),
  ], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout) as unknown;
};
