// Offline image topology test. Real launcher/policy, inert provider factories.
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { existsSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { FileSubscriptionRuntimeInstallationInspector } = require(
  "../../../apps/agent-runtime/src/subscription-runtime-installation");
const { loadCanaryManifest } = require(
  "../../../scripts/lib/reader-promotion-v2-production-canary-contract");
const contract = require(
  "../../../apps/agent-runtime/bin/reader-promotion-v2-canary-contract.cjs");

async function main() {
  assert.equal(process.cwd(), "/app");
  assert.equal(existsSync("/app/verified-checkout/node_modules"), false);
  const command = process.argv[2];
  const identity = await new FileSubscriptionRuntimeInstallationInspector().inspect(command);
  assert.equal(loadCanaryManifest().model, "gpt-5.6-sol");
  const args = [
    "target-sha", "release-sha", "backend-sha", "control-sha", "runtime-sha",
    "runtime-image-id", "workflow", "workflow-run-id", "workflow-run-attempt",
    "fence", "runtime-command", "runtime-state-root",
  ].flatMap(key => [`--${key}`, key === "workflow-run-attempt" ? "1" : "probe"]);
  const entrypoint = spawnSync(process.execPath, [
    "-r", "/app/node_modules/ts-node/register",
    "-r", "/app/node_modules/tsconfig-paths/register",
    "/app/verified-checkout/scripts/run-reader-promotion-v2-production-canary.ts",
    ...args,
  ], { encoding: "utf8", timeout: 60_000, env: {
    ...process.env, READER_PROMOTION_V2_CANARY_DATABASE_URL: "",
  } });
  assert.equal(entrypoint.status, 1, entrypoint.stderr);
  assert.equal(entrypoint.stderr.trim(),
    "READER_PROMOTION_V2_CANARY_DATABASE_URL is required");

  const root = mkdtempSync("/tmp/reader-canary-image-probe-");
  try {
    const request = join(root, "request.json");
    writeFileSync(request, JSON.stringify({
      protocolVersion: 1, runId: "offline-image-probe", cwd: root,
      timeoutMs: 10_000,
      task: {
        kind: "structured-prompt", systemPrompt: "Offline fixture.",
        prompt: "Never call a provider.",
        outputSchemaName: contract.readerPromotionV2CanarySchemaName,
        controls: {
          outputSchemaName: contract.readerPromotionV2CanarySchemaName,
          schemaVersion: contract.readerPromotionV2CanarySchemaVersion,
          outputSchema: contract.readerPromotionV2CanaryOutputSchema,
        }, metadata: {},
      }, context: {
        application: "social-monitor", purpose: contract.readerPromotionV2CanaryPurpose,
      },
    }));
    const bridge = spawnSync(process.execPath, [
      "--experimental-loader", join(__dirname, "reader-promotion-v2-canary-probe-loader.mjs"),
      command, "--provider", "codex", "--input", request,
      "--model", "gpt-5.6-sol", "--activate-reader-promotion-v2-canary",
    ], { encoding: "utf8", timeout: 30_000, env: {
      ...process.env, AGENT_RUNTIME_REASONING_EFFORT: "high",
    } });
    assert.equal(bridge.status, 0, bridge.stderr);
    assert.equal(bridge.stdout.trim(), "bridge-binary-path-resolved");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log(JSON.stringify({
    executable: identity.executablePath, version: identity.runtimePackageVersion,
    launcherSha256: identity.launcherSha256, entrypointLoaded: true,
    manifestResolved: true, binaryResolved: true, providerCalled: false,
  }));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
