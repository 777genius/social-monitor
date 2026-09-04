import { spawnSync } from "node:child_process";
import { join } from "node:path";

import type { AgentRuntimeExecutionRequest } from "./agent-runtime-executor.port";
import {
  admitSubscriptionRuntimeRequest,
  configuredSubscriptionRuntimeDefaultsAreSafe,
  subscriptionRuntimePurposeProfiles,
} from "./subscription-runtime-purpose-model-policy";

const dailyPurposes = [
  "social_monitor.reader_summary.generate.v2",
  "social_monitor.reader_summary.repair.v2",
  "social_monitor.reader_summary.topic_map.label.v2",
  "social_monitor.reader_summary.topic_map.verify_relations.v2",
  "social_monitor.reader_summary.verify_story_relations.v2",
  "social_monitor.reader_summary.verify_related_topic_relations.v2",
  "social_monitor.reader_summary.weekly.review.v2",
] as const;

const legacyReaderSummaryPurposes = [
  "social_monitor.reader_summary.generate",
  "social_monitor.reader_summary.repair",
  "social_monitor.reader_summary.topic_map.label",
  "social_monitor.reader_summary.topic_map.verify_relations",
  "social_monitor.reader_summary.verify_story_relations",
  "social_monitor.reader_summary.verify_related_topic_relations",
  "social_monitor.reader_summary.weekly.review",
  "social_monitor.reader_summary.weekly.generate",
] as const;

describe("subscription runtime purpose policy", () => {
  it("requires the exact high production service default", () => {
    expect(configuredSubscriptionRuntimeDefaultsAreSafe({})).toBe(true);
    expect(configuredSubscriptionRuntimeDefaultsAreSafe({
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
    })).toBe(true);
    expect(configuredSubscriptionRuntimeDefaultsAreSafe({
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
    })).toBe(false);
  });

  it("admits only the exact dedicated related-topic relation markers", () => {
    const exact = request({
      purpose: "social_monitor.reader_summary.verify_related_topic_relations.v2",
      controlsJson: JSON.stringify({
        outputSchemaName: "social_monitor_reader_summary_related_topic_relations",
        schemaVersion: "reader_summary.related_topic_relation.v1",
      }),
      metadata: {
        taskRole: "related_topic_relation",
        verificationLane: "related_topic",
      },
    });
    expect(() => admitSubscriptionRuntimeRequest(exact)).not.toThrow();

    for (const malformed of [
      { ...exact, controlsJson: JSON.stringify({
        outputSchemaName: "social_monitor_reader_summary_story_relations",
        schemaVersion: "reader_summary.related_topic_relation.v1",
      }) },
      { ...exact, controlsJson: JSON.stringify({
        outputSchemaName: "social_monitor_reader_summary_related_topic_relations",
        schemaVersion: "reader_summary.related_topic_relation.v2",
      }) },
      { ...exact, metadata: { ...exact.metadata, taskRole: "unknown_relation" } },
    ]) {
      expect(() => admitSubscriptionRuntimeRequest(malformed)).toThrow();
    }
  });

  it.each(dailyPurposes)(
    "keeps %s on the active reader-summary structured-output profile",
    (purpose) => {
      const admission = admitSubscriptionRuntimeRequest(request({ purpose }));
      const task = admission.canonicalRequest.task as Record<string, unknown>;
      const controls = task.controls as Record<string, unknown>;

      expect(admission.profile).toEqual({
        provider: "codex",
        model: "gpt-5.6-sol",
        reasoningEffort: "high",
        outputKind: "structured_output",
        responseFormat: "json",
      });
      expect(controls).toMatchObject({
        model: "gpt-5.6-sol",
        reasoningEffort: "high",
        responseFormat: "json",
        outputSchema: { type: "object" },
      });
    },
  );

  it.each([
    "social_monitor.reader_summary.daily.canonical_recovery.v2",
    "social_monitor.reader_summary.weekly.generate.v2",
  ])("injects the active %s text profile when exact controls are absent", (purpose) => {
    const admission = admitSubscriptionRuntimeRequest(
      request({ purpose }),
    );
    const task = admission.canonicalRequest.task as Record<string, unknown>;
    const controls = task.controls as Record<string, unknown>;

    expect(admission.profile).toEqual({
      provider: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      outputKind: "output_text",
      responseFormat: "text",
    });
    expect(controls).toMatchObject({
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      responseFormat: "text",
    });
    expect(controls.outputSchema).toBeUndefined();
  });

  it("strips both schema-name fields from output_text while preserving structured output", () => {
    const structured = admitSubscriptionRuntimeRequest(request({
      controlsJson: '{"outputSchemaName":"daily-summary"}',
    }));
    const structuredTask = structured.canonicalRequest.task as Record<string, unknown>;
    const structuredControls = structuredTask.controls as Record<string, unknown>;
    expect(structuredTask.outputSchemaName).toBe("daily-summary");
    expect(structuredControls.outputSchemaName).toBe("daily-summary");
    expect(structuredControls.outputSchema).toEqual({ type: "object" });

    const text = admitSubscriptionRuntimeRequest(request({
      purpose: "social_monitor.reader_summary.weekly.generate.v2",
      controlsJson: '{"outputSchemaName":"weekly-summary"}',
    }));
    const textTask = text.canonicalRequest.task as Record<string, unknown>;
    const textControls = textTask.controls as Record<string, unknown>;
    const textMetadata = textTask.metadata as Record<string, unknown>;
    expect(textTask).not.toHaveProperty("outputSchemaName");
    expect(textControls).not.toHaveProperty("outputSchemaName");
    expect(textControls.responseFormat).toBe("text");
    expect(textMetadata.runtimeOutput).toBe("output_text");
  });

  it.each([
    ["unknown purpose", { purpose: "social_monitor.reader_summary.unknown" }],
    ["provider", { provider: "claude" as const }],
    ["model", { controlsJson: '{"model":"gpt-5.5"}' }],
    ["effort", { metadata: { reasoningEffort: "xhigh" } }],
    ["output kind", { metadata: { runtimeOutput: "output_text" } }],
    ["output format", { controlsJson: '{"responseFormat":"xml"}' }],
    [
      "structured schema",
      { controlsJson: '{"outputSchema":{"type":"string"}}' },
    ],
    [
      "weekly structured control",
      {
        purpose: "social_monitor.reader_summary.weekly.generate.v2",
        controlsJson: '{"outputSchema":{"type":"object"}}',
      },
    ],
    ["invalid controls", { controlsJson: "[]" }],
    ["invalid schema", { outputSchemaJson: "[]" }],
  ])("rejects a conflicting or unsupported %s", (_label, override) => {
    expect(() => admitSubscriptionRuntimeRequest(request(override))).toThrow();
  });

  it("admits only the dedicated high canonical-recovery route", () => {
    const activeRecovery = request({
      purpose: "social_monitor.reader_summary.daily.canonical_recovery.v2",
      metadata: { reasoningEffort: "high" },
    });
    expect(() => admitSubscriptionRuntimeRequest(activeRecovery)).not.toThrow();
    expect(() => admitSubscriptionRuntimeRequest({
      ...activeRecovery,
      metadata: { reasoningEffort: "xhigh" },
    })).toThrow("reasoningEffort conflicts with purpose policy");
  });

  it.each(legacyReaderSummaryPurposes)(
    "fails closed for legacy reader-summary purpose %s",
    (purpose) => {
      for (const reasoningEffort of ["high", "xhigh"] as const) {
        expect(() => admitSubscriptionRuntimeRequest(request({
          purpose,
          metadata: { reasoningEffort },
        }))).toThrow("Agent runtime purpose is not admitted");
      }
    },
  );

  it("keeps the independent MJS wrapper policy in exact parity", () => {
    const tsProfiles = subscriptionRuntimePurposeProfiles();
    const mjsProfiles = readMjsProfiles();

    expect(mjsProfiles).toEqual(tsProfiles);
    for (const [purpose, profile] of Object.entries(tsProfiles)) {
      const admitted = admitSubscriptionRuntimeRequest(request({ purpose }));
      expect(
        admitWithMjsWrapper({
          request: admitted.canonicalRequest,
          provider: profile.provider,
          model: profile.model,
          reasoningEffort: profile.reasoningEffort,
        }),
      ).toEqual({
        ok: true,
        profile,
        canonicalRequest: admitted.canonicalRequest,
      });
    }
  });

  it.each([
    ["unknown purpose", { purpose: "social_monitor.unknown" }],
    ["provider", { provider: "claude" }],
    ["model", { model: "gpt-4" }],
    ["effort", { reasoningEffort: "xhigh" }],
    ["output format", { responseFormat: "text" }],
    ["output kind", { runtimeOutput: "output_text" }],
  ])("keeps MJS rejection parity for %s", (_label, override) => {
    expect(admitWithMjsWrapper(wrapperInput(override))).toMatchObject({
      ok: false,
    });
  });

  it("keeps credentials and auth paths out of the independent wrapper environment", () => {
    expect(readMjsFilteredEnvironment()).toEqual({
      PATH: "/redacted/bin",
    });
  });
});

const request = (
  override: Partial<AgentRuntimeExecutionRequest> = {},
): AgentRuntimeExecutionRequest => {
  const purpose = override.purpose ?? "social_monitor.reader_summary.generate.v2";
  const relatedDefaults = purpose ===
    "social_monitor.reader_summary.verify_related_topic_relations.v2"
    ? {
        controlsJson: JSON.stringify({
          outputSchemaName:
            "social_monitor_reader_summary_related_topic_relations",
          schemaVersion: "reader_summary.related_topic_relation.v1",
        }),
        metadata: {
          taskRole: "related_topic_relation",
          verificationLane: "related_topic",
        },
      }
    : {};
  return {
    requestId: "request-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    correlationId: "correlation-1",
    provider: "codex",
    purpose,
    systemPrompt: "Return the requested result.",
    prompt: "Summarize.",
    outputSchemaJson: '{"type":"object"}',
    controlsJson: "{}",
    timeoutMs: 1_000,
    metadata: {},
    ...relatedDefaults,
    ...override,
  };
};

const policyPath = join(
  __dirname,
  "../bin/subscription-runtime-purpose-model-policy.mjs",
);

const readMjsProfiles = (): Record<string, unknown> =>
  runMjsPolicy<Record<string, unknown>>(
    "process.stdout.write(JSON.stringify(module.subscriptionRuntimeWrapperPurposeProfiles()));",
  );

const admitWithMjsWrapper = (input: Record<string, unknown>): unknown =>
  runMjsPolicy<unknown>(
    "try { const value = module.admitSubscriptionRuntimeWrapperRequest(input); process.stdout.write(JSON.stringify({ ok: true, ...value })); } catch (error) { process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })); }",
    input,
  );

const readMjsFilteredEnvironment = (): Record<string, unknown> =>
  runMjsPolicy<Record<string, unknown>>(
    "process.stdout.write(JSON.stringify(module.subscriptionOnlyCodexEnvironment({ PATH: '/redacted/bin', CODEX_AUTH_JSON_PATH: '/redacted/account-auth.json', OPENAI_API_KEY: 'redacted', CODEX_API_KEY: 'redacted', ANTHROPIC_API_KEY: 'redacted', OTHER_API_KEY_FILE: '/redacted/key' })));",
  );

const wrapperInput = (
  override: Readonly<Record<string, string>>,
): Record<string, unknown> => {
  const admitted = admitSubscriptionRuntimeRequest(request());
  const canonicalRequest = structuredClone(admitted.canonicalRequest);
  const context = canonicalRequest.context as Record<string, unknown>;
  const task = canonicalRequest.task as Record<string, unknown>;
  const controls = task.controls as Record<string, unknown>;
  const metadata = task.metadata as Record<string, unknown>;
  if (override.purpose !== undefined) context.purpose = override.purpose;
  if (override.responseFormat !== undefined) {
    controls.responseFormat = override.responseFormat;
  }
  if (override.runtimeOutput !== undefined) {
    metadata.runtimeOutput = override.runtimeOutput;
  }
  return {
    request: canonicalRequest,
    provider: override.provider ?? admitted.profile.provider,
    model: override.model ?? admitted.profile.model,
    reasoningEffort:
      override.reasoningEffort ?? admitted.profile.reasoningEffort,
  };
};

const runMjsPolicy = <T>(expression: string, input: unknown = {}): T => {
  const evaluation = [
    'import { pathToFileURL } from "node:url";',
    "const module = await import(pathToFileURL(process.argv[1]).href);",
    "const input = JSON.parse(process.argv[2]);",
    expression,
  ].join("\n");
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      evaluation,
      policyPath,
      JSON.stringify(input),
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || "MJS purpose policy check failed");
  }
  if (result.stdout.length === 0) {
    throw new Error(JSON.stringify({
      status: result.status,
      signal: result.signal,
      error: result.error?.message,
      executable: process.execPath,
      policyPath,
    }));
  }
  return JSON.parse(result.stdout) as T;
};
