import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createMimoAppServerCustody } from "./mimo-app-server-custody.mjs";
import { loadInstalledMimoAppServerProcess } from "./installed-runtime-modules.mjs";

test("timeout stops an owned detached native child even when it ignores SIGTERM", {
  skip: process.platform === "win32",
}, async () => {
  const controller = new AbortController();
  const custody = createMimoAppServerCustody({
    signal: controller.signal,
    spawnProcess: () => spawn(process.execPath, ["-e", [
      'process.on("SIGTERM", () => {});',
      'process.stdout.write("ready\\n");',
      'setInterval(() => {}, 1000);',
    ].join("\n")], { detached: true, stdio: ["ignore", "pipe", "ignore"] }),
    signalChild: (await loadInstalledMimoAppServerProcess()).signalCodexAppServerChildGroup,
    killGraceMs: 50,
  });
  const child = custody.processFactory({});
  try {
    await Promise.race([
      new Promise((resolve) => child.stdout.once("data", resolve)),
      delay(2_000).then(() => { throw new Error("Synthetic child did not start"); }),
    ]);
    controller.abort();
    const [code, signal] = await Promise.race([
      new Promise((resolve) => child.once("close", (exitCode, exitSignal) => resolve([exitCode, exitSignal]))),
      delay(2_000).then(() => { throw new Error("Owned child survived cancellation"); }),
    ]);
    assert.equal(code, null);
    assert.equal(signal, "SIGKILL");
    assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
  } finally {
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already stopped. */ }
  }
});

import { createAssessmentCliLifecycle } from "./assessment-cli-lifecycle.mjs";

test("MiMo lifecycle deadline terminates its detached child and awaits disposal", {
  skip: process.platform === "win32",
}, async () => {
  const lifecycle = createAssessmentCliLifecycle({ reserveMs: 150, settlementMs: 50,
    disposalMs: 100, marginMs: 20 });
  lifecycle.configure(true, 600, 150);
  const custody = createMimoAppServerCustody({
    signal: lifecycle.signal,
    spawnProcess: () => spawn(process.execPath, ["-e", [
      'process.on("SIGTERM", () => {});',
      'process.stdout.write("ready\\n");',
      'setInterval(() => {}, 1000);',
    ].join("\n")], { detached: true, stdio: ["ignore", "pipe", "ignore"] }),
    signalChild: (await loadInstalledMimoAppServerProcess()).signalCodexAppServerChildGroup,
    killGraceMs: 40,
  });
  let child;
  let disposed = false;
  const worker = lifecycle.decorateWorker({
    async run() {
      child = custody.processFactory({});
      await new Promise((resolve) => child.stdout.once("data", resolve));
      await new Promise((resolve) => child.once("close", resolve));
    },
    async dispose() { disposed = true; },
  });
  try {
    const code = await lifecycle.runCli(() => worker.run({}));
    assert.equal(code, 1);
    assert.equal(disposed, true);
    assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
  } finally {
    if (child?.pid) {
      try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already stopped. */ }
    }
  }
});
