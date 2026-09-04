import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { AgentRuntimeExecutionRequest } from "./agent-runtime-executor.port";
import { SubscriptionRuntimeCliExecutor } from "./subscription-runtime-cli-executor";
import {
  readerPromotionV2CanaryActivationCapability,
  readerPromotionV2CanaryOutputSchema,
  readerPromotionV2CanaryPurpose,
  readerPromotionV2CanarySchemaName,
  readerPromotionV2CanarySchemaVersion,
} from "./subscription-runtime-purpose-model-policy";

describe("reader promotion V2 canary executor", () => {
  let root: string | undefined;

  afterEach(async () => {
    if (root !== undefined) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("validates structured output before attaching an attestation", async () => {
    const fixture = await fakeCliFixture("valid");
    const result = await executor(fixture.cliPath).execute(request());

    expect(result.status).toBe("completed");
    expect(result.executionAttestation).toMatchObject({
      purpose: readerPromotionV2CanaryPurpose,
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      selectedOutputKind: "structured_output",
    });
    expect(await attempts(fixture.attemptsPath)).toHaveLength(1);
  });

  it.each([
    "provider",
    "reconnect",
    "refresh-conflict",
    "capacity",
    "timeout",
    "invalid",
    "generic",
    "waiting",
  ])("never launches attempt two or attests a %s result", async (scenario) => {
    const fixture = await fakeCliFixture(scenario);
    const result = await executor(fixture.cliPath).execute(request({
      prompt: scenario,
    }));

    expect(result.status).toBe("failed");
    expect(result.executionAttestation).toBeUndefined();
    expect(await attempts(fixture.attemptsPath)).toEqual([scenario]);
  });

  it("does not activate the lane without the exact executor capability", async () => {
    const fixture = await fakeCliFixture("valid");
    const result = await new SubscriptionRuntimeCliExecutor({
      command: fixture.cliPath,
      ephemeral: false,
      stateRoot: join(root!, "state"),
      localEncryptionKey: "test-key",
      installationInspector,
    }).execute(request());

    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "agent_runtime.execution_attestation_invalid" },
    });
    await expect(readFile(fixture.attemptsPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  const fakeCliFixture = async (scenario: string) => {
    root = await mkdtemp(join(tmpdir(), "reader-promotion-v2-executor-"));
    const cliPath = join(root, "fake-cli.mjs");
    const attemptsPath = join(root, "attempts.ndjson");
    await writeFile(cliPath, fakeCliSource(attemptsPath, scenario), "utf8");
    await chmod(cliPath, 0o755);
    return { cliPath, attemptsPath };
  };
});

const executor = (command: string) => new SubscriptionRuntimeCliExecutor({
  command,
  ephemeral: false,
  stateRoot: join(dirname(command), "state"),
  localEncryptionKey: "test-key",
  installationInspector,
  readerPromotionV2CanaryActivationCapability,
});

const request = (
  override: Partial<AgentRuntimeExecutionRequest> = {},
): AgentRuntimeExecutionRequest => ({
  requestId: "canary-run-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  correlationId: "correlation-1",
  provider: "codex",
  purpose: readerPromotionV2CanaryPurpose,
  systemPrompt: "Return JSON only.",
  prompt: "valid",
  outputSchemaJson: JSON.stringify(readerPromotionV2CanaryOutputSchema),
  controlsJson: JSON.stringify({
    outputSchemaName: readerPromotionV2CanarySchemaName,
    schemaVersion: readerPromotionV2CanarySchemaVersion,
  }),
  timeoutMs: 5_000,
  metadata: {},
  ...override,
});

const attempts = async (path: string): Promise<readonly string[]> =>
  (await readFile(path, "utf8")).trim().split("\n");

const installationInspector = {
  inspect: async (command: string) => ({
    executablePath: command,
    packageRootRealpath: dirname(command),
    runtimePackageVersion: "0.1.0-main.30",
    launcherSha256: "a".repeat(64),
  }),
};

const validOutput = {
  decisions: [{
    leftFeedItemId: "left-1",
    rightFeedItemId: "right-1",
    sameStory: true,
    confidenceScore: 0.99,
    rationale: "Both describe the same release.",
  }],
};

const fakeCliSource = (attemptsPath: string, defaultScenario: string): string => `#!/usr/bin/env node
import { appendFile, readFile } from "node:fs/promises";
const inputIndex = process.argv.indexOf("--input");
const request = JSON.parse(await readFile(process.argv[inputIndex + 1], "utf8"));
if (!process.argv.includes("--activate-reader-promotion-v2-canary")) process.exit(91);
const scenario = request.task.prompt || ${JSON.stringify(defaultScenario)};
await appendFile(${JSON.stringify(attemptsPath)}, scenario + "\\n", "utf8");
const failure = (reason, reconnectRequired = false) => ({
  status: "failed", warnings: [], failure: {
    code: "unknown_runtime_failure", safeMessage: reason,
    retryable: true, reconnectRequired, causeCategory: "provider",
    details: { reason },
  },
});
const results = {
  valid: { status: "completed", structuredOutput: ${JSON.stringify(validOutput)}, warnings: [] },
  provider: failure("quota_limited"),
  reconnect: failure("reconnect_required", true),
  "refresh-conflict": failure("refresh_conflict"),
  capacity: failure("capacity_unavailable"),
  timeout: failure("task_timeout"),
  invalid: { status: "completed", structuredOutput: { decisions: [{ sameStory: "yes" }] }, warnings: [] },
  generic: failure("generic_failure"),
  waiting: { status: "waiting_for_input", warnings: [] },
};
process.stdout.write(JSON.stringify(results[scenario] || failure("generic_failure")));
`;
