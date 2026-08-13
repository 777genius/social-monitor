import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { AgentRuntimeExecutionRequest } from "./agent-runtime-executor.port";
import { SubscriptionRuntimeCliExecutor } from "./subscription-runtime-cli-executor";

describe("SubscriptionRuntimeCliExecutor", () => {
  let tempDir: string | undefined;
  let previousCodexThreadId: string | undefined;
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
  const originalOtherApiKeyFile = process.env.OTHER_API_KEY_FILE;

  afterEach(async () => {
    if (previousCodexThreadId === undefined) {
      delete process.env.CODEX_THREAD_ID;
    } else {
      process.env.CODEX_THREAD_ID = previousCodexThreadId;
    }
    previousCodexThreadId = undefined;
    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }
    if (originalOtherApiKeyFile === undefined) {
      delete process.env.OTHER_API_KEY_FILE;
    } else {
      process.env.OTHER_API_KEY_FILE = originalOtherApiKeyFile;
    }

    if (tempDir !== undefined) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("maps Social Monitor purpose to context and uses a supported runtime task kind", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agent-runtime-cli-test-"));
    const capturePath = join(tempDir, "capture.json");
    const cliPath = join(tempDir, "fake-cli.mjs");
    process.env.OPENAI_API_KEY = "redacted-test-placeholder";
    process.env.OTHER_API_KEY_FILE = "/redacted/api-key";

    await writeFile(
      cliPath,
      [
        "#!/usr/bin/env node",
        'import { readFile, writeFile } from "node:fs/promises";',
        'const inputIndex = process.argv.indexOf("--input");',
        "const inputPath = process.argv[inputIndex + 1];",
        'const request = JSON.parse(await readFile(inputPath, "utf8"));',
        `await writeFile(${JSON.stringify(capturePath)}, JSON.stringify({ argv: process.argv.slice(2), request, hasLocalEncryptionKey: process.env.SUBSCRIPTION_RUNTIME_LOCAL_ENCRYPTION_KEY === "test-key", hasApiKeyCredential: Object.keys(process.env).some((key) => key.endsWith("_API_KEY") || key.endsWith("_API_KEY_FILE")), codexThreadId: process.env.CODEX_THREAD_ID ?? "", reasoningEffort: process.env.AGENT_RUNTIME_REASONING_EFFORT ?? "" }), "utf8");`,
        'process.stdout.write(JSON.stringify({ status: "completed", structuredOutput: {}, warnings: [] }));',
      ].join("\n"),
      "utf8",
    );
    await chmod(cliPath, 0o755);

    const executor = new SubscriptionRuntimeCliExecutor({
      command: cliPath,
      ephemeral: true,
      codexAuthJsonPath: "/redacted/account-auth.json",
      claudeTokenEnv: "CLAUDE_CODE_OAUTH_TOKEN",
      installationInspector,
    });

    const result = await executor.execute(validExecutionRequest());

    const captured = JSON.parse(
      await readFile(capturePath, "utf8"),
    ) as CapturedCliRequest;

    expect(captured.request.task.kind).toBe("structured-prompt");
    expect(captured.request.context.purpose).toBe(
      "social_monitor.summary.generate",
    );
    expect(captured.request.task.prompt).toBe("Return JSON.");
    expect(captured.argv).toEqual(expect.arrayContaining(["--ephemeral"]));
    expect(captured.argv).toEqual(
      expect.arrayContaining([
        "--codex-auth-json",
        "/redacted/account-auth.json",
      ]),
    );
    expect(captured.argv).not.toContain("--claude-token-env");
    expect(captured.hasApiKeyCredential).toBe(false);
    expect(result.executionAttestation).toMatchObject({
      requestId: "request-1",
      purpose: "social_monitor.summary.generate",
      provider: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
      runtimeEngine: "subscription-runtime-cli",
      runtimePackageVersion: "0.1.0-main.2",
      selectedOutputKind: "structured_output",
    });
  });

  it("passes the local encryption key to durable subscription runtime tasks", async () => {
    previousCodexThreadId = process.env.CODEX_THREAD_ID;
    process.env.CODEX_THREAD_ID = "host-codex-thread";
    tempDir = await mkdtemp(join(tmpdir(), "agent-runtime-cli-test-"));
    const capturePath = join(tempDir, "capture.json");
    const cliPath = join(tempDir, "fake-cli.mjs");

    await writeFile(
      cliPath,
      [
        "#!/usr/bin/env node",
        'import { readFile, writeFile } from "node:fs/promises";',
        'const inputIndex = process.argv.indexOf("--input");',
        "const inputPath = process.argv[inputIndex + 1];",
        'const request = JSON.parse(await readFile(inputPath, "utf8"));',
        `await writeFile(${JSON.stringify(capturePath)}, JSON.stringify({ argv: process.argv.slice(2), request, hasLocalEncryptionKey: process.env.SUBSCRIPTION_RUNTIME_LOCAL_ENCRYPTION_KEY === "test-key", codexThreadId: process.env.CODEX_THREAD_ID ?? "", reasoningEffort: process.env.AGENT_RUNTIME_REASONING_EFFORT ?? "" }), "utf8");`,
        'process.stdout.write(JSON.stringify({ status: "completed", outputText: "{}", warnings: [] }));',
      ].join("\n"),
      "utf8",
    );
    await chmod(cliPath, 0o755);

    const executor = new SubscriptionRuntimeCliExecutor({
      command: cliPath,
      ephemeral: false,
      stateRoot: "/tmp/social-monitor-agent-runtime-test-state",
      localEncryptionKey: "test-key",
      reasoningEffort: "xhigh",
      installationInspector,
    });

    await executor.execute(validExecutionRequest());

    const captured = JSON.parse(
      await readFile(capturePath, "utf8"),
    ) as CapturedCliRequest;

    expect(captured.argv).toEqual(
      expect.arrayContaining([
        "--state-root",
        "/tmp/social-monitor-agent-runtime-test-state",
      ]),
    );
    expect(captured.hasLocalEncryptionKey).toBe(true);
    expect(captured.codexThreadId).toBe("");
    expect(captured.reasoningEffort).toBe("xhigh");
  });

  it.each([
    ["provider_session_invalid", "Codex session is invalid."],
    ["needs_reconnect", "Provider session is missing."],
  ])(
    "retries one unavailable durable Codex session as ephemeral (%s)",
    async (failureCode, safeMessage) => {
      tempDir = await mkdtemp(join(tmpdir(), "agent-runtime-cli-test-"));
      const attemptsPath = join(tempDir, "attempts.json");
      const cliPath = join(tempDir, "fake-cli.mjs");

      await writeFile(
        cliPath,
        [
          "#!/usr/bin/env node",
          'import { readFile, writeFile } from "node:fs/promises";',
          `const attemptsPath = ${JSON.stringify(attemptsPath)};`,
          "let attempts = [];",
          "try { attempts = JSON.parse(await readFile(attemptsPath, 'utf8')); } catch {}",
          "const ephemeral = process.argv.includes('--ephemeral');",
          "attempts.push({ ephemeral });",
          "await writeFile(attemptsPath, JSON.stringify(attempts), 'utf8');",
          "const result = ephemeral",
          "  ? { status: 'completed', structuredOutput: {}, warnings: [] }",
          `  : { status: 'failed', warnings: [], failure: { code: ${JSON.stringify(failureCode)}, safeMessage: ${JSON.stringify(safeMessage)}, retryable: true, reconnectRequired: true, causeCategory: ${JSON.stringify(failureCode)} } };`,
          "process.stdout.write(JSON.stringify(result));",
        ].join("\n"),
        "utf8",
      );
      await chmod(cliPath, 0o755);
      const executor = new SubscriptionRuntimeCliExecutor({
        command: cliPath,
        ephemeral: false,
        stateRoot: join(tempDir, "state"),
        localEncryptionKey: "test-key",
        installationInspector,
      });

      const result = await executor.execute(validExecutionRequest());
      const attempts = JSON.parse(
        await readFile(attemptsPath, "utf8"),
      ) as readonly { readonly ephemeral: boolean }[];

      expect(result.status).toBe("completed");
      expect(result.warnings).toContainEqual({
        code: "agent_runtime.session_recovered_ephemeral",
        message:
          "Durable provider session was unavailable; retried in an isolated session",
      });
      expect(attempts).toEqual([{ ephemeral: false }, { ephemeral: true }]);
    },
  );

  it("preserves a typed quota failure and its safe cooldown details", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agent-runtime-cli-test-"));
    const cliPath = join(tempDir, "fake-quota-cli.mjs");
    await writeFile(
      cliPath,
      [
        "#!/usr/bin/env node",
        "process.stdout.write(JSON.stringify({ status: 'failed', warnings: [], failure: { code: 'unknown_runtime_failure', safeMessage: 'Account quota is unavailable.', retryable: false, reconnectRequired: false, details: { reason: 'quota_limited', cooldownUntil: '2026-08-13T00:00:00.000Z', stderrTail: 'must-not-cross-boundary' } } }));",
      ].join("\n"),
      "utf8",
    );
    await chmod(cliPath, 0o755);
    const executor = new SubscriptionRuntimeCliExecutor({
      command: cliPath,
      ephemeral: true,
      installationInspector,
    });

    const result = await executor.execute(validExecutionRequest());

    expect(result).toMatchObject({
      status: "failed",
      failure: {
        code: "quota_limited",
        retryable: true,
        reconnectRequired: false,
        details: {
          reason: "quota_limited",
          cooldownUntil: "2026-08-13T00:00:00.000Z",
        },
      },
    });
    expect(result.failure?.details).not.toHaveProperty("stderrTail");
  });

  it("spawns the exact executable path admitted by the inspector", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agent-runtime-cli-test-"));
    const cliPath = join(tempDir, "admitted-cli.mjs");
    await writeFile(
      cliPath,
      [
        "#!/usr/bin/env node",
        'process.stdout.write(JSON.stringify({ status: "completed", structuredOutput: {}, warnings: [] }));',
      ].join("\n"),
      "utf8",
    );
    await chmod(cliPath, 0o755);
    const executor = new SubscriptionRuntimeCliExecutor({
      command: "untrusted-path-alias",
      ephemeral: true,
      installationInspector: {
        inspect: async () => installation(cliPath),
      },
    });

    await expect(
      executor.execute(validExecutionRequest()),
    ).resolves.toMatchObject({ status: "completed" });
  });

  it("reports serving when the approved wrapper reaches its input boundary", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agent-runtime-cli-test-"));
    const cliPath = join(tempDir, "approved-wrapper.mjs");
    await writeFile(
      cliPath,
      [
        "#!/usr/bin/env node",
        "if (process.argv.includes('--provider')) {",
        "  process.stderr.write('Error: --input is required\\n');",
        "  process.exitCode = 1;",
        "}",
      ].join("\n"),
      "utf8",
    );
    await chmod(cliPath, 0o755);
    const executor = new SubscriptionRuntimeCliExecutor({
      command: cliPath,
      ephemeral: true,
      installationInspector,
    });

    await expect(executor.checkHealth()).resolves.toEqual({
      healthy: true,
      runtimeEngine: "subscription-runtime-cli",
      runtimeVersion: "0.1.0-main.2",
      launcherSha256: "a".repeat(64),
      warnings: [],
    });
  });

  it("fails closed when the admitted installation changes after execution", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agent-runtime-cli-test-"));
    const cliPath = join(tempDir, "admitted-cli.mjs");
    await writeFile(
      cliPath,
      [
        "#!/usr/bin/env node",
        'process.stdout.write(JSON.stringify({ status: "completed", structuredOutput: {}, warnings: [] }));',
      ].join("\n"),
      "utf8",
    );
    await chmod(cliPath, 0o755);
    let inspections = 0;
    const executor = new SubscriptionRuntimeCliExecutor({
      command: cliPath,
      ephemeral: true,
      installationInspector: {
        inspect: async () => ({
          ...installation(cliPath),
          launcherSha256: (++inspections === 1 ? "a" : "b").repeat(64),
        }),
      },
    });

    await expect(
      executor.execute(validExecutionRequest()),
    ).resolves.toMatchObject({
      status: "failed",
      failure: { code: "agent_runtime.execution_attestation_invalid" },
    });
  });

  it("routes the weekly purpose to gpt-5.6-sol xhigh output_text", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agent-runtime-cli-test-"));
    const capturePath = join(tempDir, "weekly-capture.json");
    const cliPath = join(tempDir, "fake-weekly-cli.mjs");
    await writeFile(
      cliPath,
      [
        "#!/usr/bin/env node",
        'import { readFile, writeFile } from "node:fs/promises";',
        'const inputIndex = process.argv.indexOf("--input");',
        "const request = JSON.parse(await readFile(process.argv[inputIndex + 1], 'utf8'));",
        `await writeFile(${JSON.stringify(capturePath)}, JSON.stringify({ argv: process.argv.slice(2), request, reasoningEffort: process.env.AGENT_RUNTIME_REASONING_EFFORT }), "utf8");`,
        'process.stdout.write(JSON.stringify({ status: "completed", outputText: "{\\"headline\\":\\"weekly\\"}", warnings: [] }));',
      ].join("\n"),
      "utf8",
    );
    await chmod(cliPath, 0o755);
    const executor = new SubscriptionRuntimeCliExecutor({
      command: cliPath,
      ephemeral: true,
      installationInspector,
    });

    const result = await executor.execute(
      validExecutionRequest({
        purpose: "social_monitor.reader_summary.weekly.generate",
        controlsJson: JSON.stringify({ model: "gpt-5.6-sol" }),
        metadata: {
          reasoningEffort: "xhigh",
          runtimeOutput: "output_text",
        },
      }),
    );
    const captured = JSON.parse(
      await readFile(capturePath, "utf8"),
    ) as CapturedCliRequest;

    expect(captured.argv).toEqual(
      expect.arrayContaining(["--model", "gpt-5.6-sol"]),
    );
    expect(captured.request.task.controls).toMatchObject({
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
      responseFormat: "text",
    });
    expect(captured.request.task.controls.outputSchema).toBeUndefined();
    expect(captured.request.task.metadata).toMatchObject({
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
      runtimeOutput: "output_text",
    });
    expect(captured.reasoningEffort).toBe("xhigh");
    expect(result.executionAttestation).toMatchObject({
      purpose: "social_monitor.reader_summary.weekly.generate",
      provider: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
      selectedOutputKind: "output_text",
    });
  });

  it.each([
    ["unknown purpose", { purpose: "social_monitor.unknown" }],
    ["provider mismatch", { provider: "claude" as const }],
    ["model conflict", { controlsJson: '{"model":"gpt-4"}' }],
    [
      "effort conflict",
      { controlsJson: '{"reasoningEffort":"high"}' },
    ],
    [
      "output conflict",
      { controlsJson: '{"responseFormat":"text"}' },
    ],
    [
      "unsupported output",
      { controlsJson: '{"responseFormat":"yaml"}' },
    ],
  ])(
    "rejects %s before installation inspection, temp creation, or spawn",
    async (_label, override) => {
      let inspections = 0;
      const executor = new SubscriptionRuntimeCliExecutor({
        command: "must-not-be-inspected",
        ephemeral: true,
        installationInspector: {
          inspect: async () => {
            inspections += 1;
            throw new Error("unexpected installation inspection");
          },
        },
      });

      const result = await executor.execute(validExecutionRequest(override));

      expect(result).toMatchObject({
        status: "failed",
        failure: { code: "agent_runtime.execution_attestation_invalid" },
      });
      expect(inspections).toBe(0);
    },
  );

  it("rejects unsafe configured defaults before installation inspection", async () => {
    let inspections = 0;
    const executor = new SubscriptionRuntimeCliExecutor({
      command: "must-not-be-inspected",
      ephemeral: true,
      model: "gpt-5.5",
      installationInspector: {
        inspect: async () => {
          inspections += 1;
          throw new Error("unexpected installation inspection");
        },
      },
    });

    await expect(
      executor.execute(validExecutionRequest()),
    ).resolves.toMatchObject({
      status: "failed",
      failure: { code: "agent_runtime.execution_attestation_invalid" },
    });
    expect(inspections).toBe(0);
  });
});

type CapturedCliRequest = {
  readonly argv: readonly string[];
  readonly request: {
    readonly task: {
      readonly kind: string;
      readonly prompt: string;
      readonly controls: Record<string, unknown>;
      readonly metadata: Record<string, string>;
    };
    readonly context: {
      readonly purpose: string;
    };
  };
  readonly hasLocalEncryptionKey: boolean;
  readonly hasApiKeyCredential: boolean;
  readonly codexThreadId: string;
  readonly reasoningEffort: string;
};

const validExecutionRequest = (
  override: Partial<AgentRuntimeExecutionRequest> = {},
): AgentRuntimeExecutionRequest => ({
  requestId: "request-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  correlationId: "corr-1",
  provider: "codex",
  purpose: "social_monitor.summary.generate",
  systemPrompt: "Return JSON only.",
  prompt: "Return JSON.",
  outputSchemaJson: "{}",
  controlsJson: "{}",
  timeoutMs: 10_000,
  metadata: {},
  ...override,
});

const installationInspector = {
  inspect: async (command: string) => installation(command),
};

const installation = (command: string) => ({
  executablePath: command,
  packageRootRealpath: dirname(command),
  runtimePackageVersion: "0.1.0-main.2",
  launcherSha256: "a".repeat(64),
});
