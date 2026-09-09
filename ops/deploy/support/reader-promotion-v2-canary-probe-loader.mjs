// Used only by the no-network image test. Never starts a real worker/provider.
const factoryProbe = `
  import assert from "node:assert/strict";
  import { accessSync, closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
  export class FileBackendCodexWorker {
    constructor(input) {
      assert.equal(process.platform, "linux");
      const target = { x64: "x86_64-unknown-linux-musl", arm64: "aarch64-unknown-linux-musl" }[process.arch];
      assert.ok(target, "unsupported native Codex architecture");
      assert.equal(input.codexBinaryPath,
        "/app/node_modules/@openai/codex-linux-" + process.arch + "/vendor/" + target + "/bin/codex");
      accessSync(input.codexBinaryPath, constants.X_OK);
      const binary = openSync(input.codexBinaryPath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        assert.ok(fstatSync(binary).isFile());
        const header = Buffer.alloc(4);
        assert.equal(readSync(binary, header, 0, 4, 0), 4);
        assert.deepEqual(header, Buffer.from([127, 69, 76, 70]));
      } finally { closeSync(binary); }
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
