import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveAgentRuntimeSettings } from "./agent-runtime-settings";

describe("resolveAgentRuntimeSettings", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir !== undefined) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("loads the durable local encryption key from a file", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agent-runtime-settings-test-"));
    const keyPath = join(tempDir, "local-encryption-key.base64");
    await writeFile(keyPath, "test-key\n", "utf8");

    const settings = resolveAgentRuntimeSettings({
      AGENT_RUNTIME_LOCAL_ENCRYPTION_KEY_FILE: keyPath,
    });

    expect(settings.cli.localEncryptionKey).toBe("test-key");
  });

  it("lets the explicit subscription runtime encryption key override the file", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agent-runtime-settings-test-"));
    const keyPath = join(tempDir, "local-encryption-key.base64");
    await writeFile(keyPath, "file-key\n", "utf8");

    const settings = resolveAgentRuntimeSettings({
      AGENT_RUNTIME_LOCAL_ENCRYPTION_KEY_FILE: keyPath,
      SUBSCRIPTION_RUNTIME_LOCAL_ENCRYPTION_KEY: "env-key",
    });

    expect(settings.cli.localEncryptionKey).toBe("env-key");
  });

  it("defaults production runtime admission to gpt-5.6-sol with high reasoning", () => {
    const settings = resolveAgentRuntimeSettings({});

    expect(settings.cli).toMatchObject({
      command:
        "apps/agent-runtime/bin/run-codex-subscription-runtime-agent-task.mjs",
      stateRoot: expect.stringMatching(
        /\.local\/state\/social-monitor\/subscription-runtime$/,
      ),
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
    });
  });

  it("accepts the exact production service model overlay", async () => {
    const overlay = await readFile(
      join(
        process.cwd(),
        "ops/deploy/production-runtime/compose.agent-runtime-model.yml",
      ),
      "utf8",
    );
    const model = overlay.match(/^ {6}AGENT_RUNTIME_MODEL: (.+)$/mu)?.[1];
    const reasoningEffort = overlay.match(
      /^ {6}AGENT_RUNTIME_REASONING_EFFORT: (.+)$/mu,
    )?.[1];

    expect(model).toBe("gpt-5.6-sol");
    expect(reasoningEffort).toBe("high");
    expect(
      resolveAgentRuntimeSettings({
        AGENT_RUNTIME_MODEL: model,
        AGENT_RUNTIME_REASONING_EFFORT: reasoningEffort,
      }).cli,
    ).toMatchObject({ model: "gpt-5.6-sol", reasoningEffort: "high" });
  });

  it("accepts the subscription runtime state-root alias", () => {
    const settings = resolveAgentRuntimeSettings({
      SUBSCRIPTION_RUNTIME_STATE_ROOT: "/tmp/runtime-state",
    });

    expect(settings.cli.stateRoot).toBe("/tmp/runtime-state");
  });

  it("rejects a service default outside the exact production route", () => {
    expect(() =>
      resolveAgentRuntimeSettings({ AGENT_RUNTIME_REASONING_EFFORT: "xhigh" }),
    ).toThrow("AGENT_RUNTIME_REASONING_EFFORT must be high");
  });
});
