import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as originalSetTimeout } from "node:timers";
const realSetTimeout = originalSetTimeout;
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

export const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
export const completed = { status: "completed", outputText: "Synthetic output", structuredOutput: { reviews: [] },
  warnings: [], usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } };
export const request = { protocolVersion: 1, runId: "synthetic-assessment",
  timeoutMs: 60_000, task: { kind: "structured-prompt", prompt: "Synthetic assessment", outputSchemaName: "social_monitor_source_content_quality_review",
    controls: { outputSchema: { type: "object" } } },
  context: { purpose: "social_monitor.relevance.assess_source_content.v1" } };

// Import the pinned legacy entrypoint, never the prepared main.41 installation or a real worker factory.
export async function legacyFixture() {
  const root = await mkdtemp(join(tmpdir(), "assessment-deadline-legacy-"));
  const archive = join(process.cwd(), "vendor/vioxen-subscription-runtime-0.1.0-main.42-sm.1.tgz");
  assert.equal(createHash("sha256").update(await readFile(archive)).digest("hex"),
    "66a8bdf6ae680bd3548fc92df140fb9df2202c829f946b9122393090faf9e31e");
  try {
    execFileSync("tar", ["-xzf", archive, "-C", root], { timeout: 10_000, stdio: "pipe" });
    const packageRoot = join(root, "package");
    for (const name of ["@anthropic-ai/claude-agent-sdk", "@modelcontextprotocol/sdk", "@types/node", "ajv", "libsodium-wrappers", "zod"]) {
      const destination = join(packageRoot, "node_modules", name);
      await mkdir(dirname(destination), { recursive: true });
      let provided;
      try { provided = await realpath(join(process.cwd(), "node_modules/@vioxen/subscription-runtime/node_modules", name)); }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        provided = await realpath(join(process.cwd(), "node_modules", name));
      }
      await symlink(provided, destination);
    }
    const { runSubscriptionAgentTaskCli } = await import(pathToFileURL(join(packageRoot, "dist/worker-local/agent-task-runner-cli.js")));
    return { root, runSubscriptionAgentTaskCli, close: () => rm(root, { recursive: true, force: true }) };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
export function fakeIo(root, input = request) {
  const stdout = [], stderr = [];
  return { stdout, stderr, readStdin: async () => JSON.stringify(input), cwd: () => root,
    env: () => ({ SYNTHETIC_LOCAL_KEY: "synthetic-test-value" }),
    writeStdout: (line) => stdout.push(line), writeStderr: (line) => stderr.push(line) };
}
export const legacyArgs = ["--provider", "codex", "--format", "result-json", "--state-root", "/synthetic-unused",
  "--encryption-key-env", "SYNTHETIC_LOCAL_KEY"];


// Only wait for the legacy entrypoint's sandbox realpath IO; lifecycle time stays fake.
export async function waitFor(predicate) {
  for (let i = 0; i < 5000 && !predicate(); i++) await new Promise((resolve) => realSetTimeout(resolve, 1));
  assert.ok(predicate(), "Synthetic fixture did not reach its awaited IO boundary");
}
