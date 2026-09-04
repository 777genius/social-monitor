// Used only by the no-network image test. Never starts a real worker/provider.
const factoryProbe = `
  import assert from "node:assert/strict";
  import { accessSync, constants } from "node:fs";
  export class FileBackendCodexWorker {
    constructor(input) {
      assert.equal(input.codexBinaryPath, "/app/node_modules/.bin/codex");
      accessSync(input.codexBinaryPath, constants.X_OK);
      assert.equal(input.model, "gpt-5.6-sol");
      assert.equal(input.reasoningEffort, "high");
      assert.equal(input.executionEngine, "packaged-exec");
      assert.equal(input.refreshConflictRetryMaxMs, 0);
      this.offlineFactoryProbe = true;
    }
    start() { throw new Error("offline probe must never start a worker"); }
    run() { throw new Error("offline probe must never run a worker"); }
  }
  export class NodeProcessRunner {
    capabilities = {};
    run() { throw new Error("offline probe must never spawn a provider"); }
  }
  export class FileBackendCodexSafeExecutor {}
  export class SubscriptionWorkerError extends Error {}
  export async function runSubscriptionAgentTaskCli(args, unused, factory) {
    const worker = factory({
      provider: "codex", model: "gpt-5.6-sol", env: {},
      cwd: "/tmp/offline-image-probe", stateRootDir: "/tmp/offline-state",
    });
    assert.equal(worker.offlineFactoryProbe, true);
    console.log("bridge-binary-path-resolved");
    return 0;
  }
`;
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@vioxen/subscription-runtime/worker-codex" ||
      specifier === "@vioxen/subscription-runtime/worker-core" ||
      specifier.endsWith("/subscription-runtime/dist/worker-local/agent-task-runner-cli.js")) {
    return { url: `data:text/javascript,${encodeURIComponent(factoryProbe)}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
