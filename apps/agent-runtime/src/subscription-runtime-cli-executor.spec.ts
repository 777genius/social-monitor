import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentRuntimeExecutionRequest } from "./agent-runtime-executor.port";
import { SubscriptionRuntimeCliExecutor } from "./subscription-runtime-cli-executor";

describe("SubscriptionRuntimeCliExecutor", () => {
  let tempDir: string | undefined;
  let previousCodexThreadId: string | undefined;

  afterEach(async () => {
    if (previousCodexThreadId === undefined) {
      delete process.env.CODEX_THREAD_ID;
    } else {
      process.env.CODEX_THREAD_ID = previousCodexThreadId;
    }
    previousCodexThreadId = undefined;

    if (tempDir !== undefined) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("maps Social Monitor purpose to context and uses a supported runtime task kind", async () => {
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
      ephemeral: true,
    });

    await executor.execute(validExecutionRequest());

    const captured = JSON.parse(
      await readFile(capturePath, "utf8"),
    ) as CapturedCliRequest;

    expect(captured.request.task.kind).toBe("structured-prompt");
    expect(captured.request.context.purpose).toBe(
      "social_monitor.summary.generate",
    );
    expect(captured.request.task.prompt).toBe("Return JSON.");
    expect(captured.argv).toEqual(expect.arrayContaining(["--ephemeral"]));
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
});

type CapturedCliRequest = {
  readonly argv: readonly string[];
  readonly request: {
    readonly task: {
      readonly kind: string;
      readonly prompt: string;
    };
    readonly context: {
      readonly purpose: string;
    };
  };
  readonly hasLocalEncryptionKey: boolean;
  readonly codexThreadId: string;
  readonly reasoningEffort: string;
};

const validExecutionRequest = (): AgentRuntimeExecutionRequest => ({
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
});
