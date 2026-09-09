import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";
import {
  successorFixtureUsage, successorPreparationFailure, type SuccessorPreparationPhase,
} from "./reader-summary-successor-fixture-diagnostics";

const secret = "FABRICATED_DO_NOT_EMIT";
const secretError = (code?: unknown) => Object.assign(new Error(
  `postgresql://fake:${secret}@invalid/db SQL parameter ${secret}`,
), { code, actual: { token: secret }, expected: secret, detail: secret,
  query: `SELECT '${secret}'`, cause: new Error(secret), stdout: secret, stderr: secret });

describe("successor fixture preparation diagnostics", () => {
  it("distinguishes usage, marker validation and provisioning ACL failure", () => {
    expect(successorPreparationFailure("usage", secretError()).reason).toBe(successorFixtureUsage);
    expect(successorPreparationFailure("marker", secretError())).toMatchObject({
      phase: "marker", reason: expect.stringContaining("immutable regular marker"), nativeGate: "not-run",
    });
    expect(successorPreparationFailure("provisioning", secretError("42501"))).toEqual({
      status: "failed", synthetic: true, nativeGate: "not-run", phase: "provisioning", code: "42501",
      reason: "Fixture migration/observer provisioning or privilege audit was denied; check disposable admin/bootstrap grants.",
    });
  });

  it.each(["42501", "42P01", "08006", "EEXIST", "ENOENT", "EACCES", "ECONNREFUSED"])(
    "retains only validated code %s", code => {
      const receipt = successorPreparationFailure("output", secretError(code));
      expect(receipt.code).toBe(code);
      expect(JSON.stringify(receipt)).not.toContain(secret);
      expect(Object.keys(receipt).sort()).toEqual(["code", "nativeGate", "phase", "reason", "status", "synthetic"]);
    },
  );

  it.each([undefined, null, 42501, "42501\n", "42p01", "42501 " + secret, secret, { secret }])(
    "omits malformed or non-allowlisted code %#", code => {
      const receipt = successorPreparationFailure("provisioning", secretError(code));
      expect(receipt).not.toHaveProperty("code");
      expect(JSON.stringify(receipt)).not.toContain(secret);
    },
  );

  it.each<SuccessorPreparationPhase>([
    "usage", "marker", "output", "attestation", "provisioning", "seed", "runtime",
    "manifest", "artifacts", "receipt", "cleanup",
  ])("uses only trusted text for %s", phase => {
    const receipt = successorPreparationFailure(phase, secretError());
    expect(receipt).toMatchObject({ phase, status: "failed", nativeGate: "not-run" });
    expect(receipt.reason.length).toBeGreaterThan(20);
    expect(JSON.stringify(receipt)).not.toMatch(/FABRICATED_DO_NOT_EMIT|postgresql:|SELECT/);
  });

  it("ignores assertion payloads, thrown primitives and hostile code accessors", () => {
    const getter = jest.fn(() => { throw new Error(secret); });
    const errors: unknown[] = [secret, null, undefined,
      new assert.AssertionError({ actual: secret, expected: secret + "expected", message: secret }),
      Object.defineProperty({}, "code", { get: getter }),
      new Proxy({}, { getOwnPropertyDescriptor: getter }),
    ];
    for (const error of errors) {
      const receipt = successorPreparationFailure("marker", error);
      expect(receipt).not.toHaveProperty("code");
      expect(JSON.stringify(receipt)).not.toContain(secret);
    }
    expect(getter).toHaveBeenCalledTimes(1); // proxy trap only; code getter is never invoked
  });
});

// Execute the actual CLI catch and phase assignments with inert dependencies.
// No process, database, migration, seed or filesystem write is started.
describe("preparation CLI failure log wiring", () => {
  const source = readFileSync(path.join(__dirname, "../prepare-reader-summary-successor-fixture.ts"), "utf8");
  const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, esModuleInterop: true } }).outputText;

  it.each(["usage", "marker", "output", "attestation", "provisioning"] as const)(
    "logs safe %s failure and exits nonzero without native approval", async failurePhase => {
      const log = jest.fn(), errorLog = jest.fn();
      const error = secretError(failurePhase === "provisioning" ? "42501" : failurePhase === "output" ? "EEXIST" : undefined);
      const failAt = (phase: string) => { if (phase === failurePhase) throw error; };
      const migrate = jest.fn(async () => { failAt("provisioning"); throw new Error("unexpected migration completion"); });
      const end = jest.fn(async () => undefined);
      const processStub = {
        argv: ["node", "prepare", ...(failurePhase === "usage" ? [] : [secret, secret, secret])],
        env: {}, cwd: () => "/fabricated", execPath: "/usr/bin/node", exitCode: 0,
      };
      const moduleStub = { exports: {} };
      const dependencies: Record<string, unknown> = {
        "node:assert/strict": assert,
        "node:path": path,
        "node:fs": { realpathSync: (value: string) => value, mkdirSync: () => failAt("output") },
        pg: { Pool: class { end = end; } },
        "./lib/reader-summary-successor-fixture-diagnostics": { successorFixtureUsage, successorPreparationFailure },
        "./lib/reader-summary-successor-fixture-safety": {
          readFixtureMarker: () => { failAt("marker"); return {}; },
          assertFixtureTarget: () => new URL("postgresql://fabricated@localhost/fixture"),
          attestEmptyFixture: async () => failAt("attestation"),
        },
        "./lib/reader-summary-successor-fixture-migrations": { migrateSuccessorFixture: migrate },
      };
      const requireStub = Object.assign((name: string) => dependencies[name] ?? {}, { main: moduleStub });
      runInNewContext(compiled, {
        require: requireStub, module: moduleStub, exports: moduleStub.exports,
        process: processStub, console: { log, error: errorLog },
      });
      await setImmediate();
      expect(processStub.exitCode).toBe(1);
      expect(log).not.toHaveBeenCalled();
      expect(errorLog).toHaveBeenCalledTimes(1);
      const serialized = errorLog.mock.calls[0][0] as string;
      const receipt = JSON.parse(serialized) as Record<string, unknown>;
      expect(receipt).toMatchObject({ status: "failed", nativeGate: "not-run", phase: failurePhase });
      expect(serialized).not.toContain(secret);
      if (failurePhase === "usage") expect(receipt.reason).toBe(successorFixtureUsage);
      if (failurePhase === "provisioning") expect(receipt.code).toBe("42501");
      expect(migrate).toHaveBeenCalledTimes(failurePhase === "provisioning" ? 1 : 0);
      expect(end).toHaveBeenCalledTimes(["attestation", "provisioning"].includes(failurePhase) ? 1 : 0);
    },
  );
});
