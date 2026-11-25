import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import { validateAgentRuntimeDefaultCwd } from
  "@social-monitor/summary/adapters/model/grpc-agent-runtime-client";

// Evaluate the actual CLI factory without executing the CLI's database/main
// entrypoint. The existing gRPC client tests cover serialization of defaultCwd.
const source = ts.createSourceFile(
  "capture.ts",
  readFileSync(join(__dirname, "capture-durable-reader-summary-from-postgres.ts"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const declaration = source.statements
  .filter(ts.isVariableStatement)
  .flatMap((statement) => [...statement.declarationList.declarations])
  .find((node) => node.name.getText(source) === "buildAgentRuntimeClient");
if (declaration?.initializer === undefined) throw new Error("Capture client factory missing");
const factory = ts.transpileModule(`(${declaration.initializer.getText(source)})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

const connectWith = (env: NodeJS.ProcessEnv) => {
  const connect = jest.fn((options: unknown) => options);
  const build = runInNewContext(factory, {
    process: { env },
    GrpcAgentRuntimeClient: { connect },
    SystemClock: class {},
    CryptoIdGenerator: class { generate = () => "run-id"; },
    resolveReaderSummaryAgentRuntimeTransport: () => "agent-runtime",
    createReaderSummaryAgentRuntimeClient: (params: { agentRuntime: () => unknown }) => params.agentRuntime(),
    requiredEnv: () => "127.0.0.1:1",
    readIntegerEnv: () => 5_000,
    readEnv: () => undefined,
    validateAgentRuntimeDefaultCwd,
  }) as () => { options: { defaultCwd?: string } };
  return { build, connect };
};

describe("durable capture CLI runtime cwd", () => {
  it("passes the configured host workspace to the real client factory", () => {
    const { build } = connectWith({ AGENT_RUNTIME_TASK_CWD: "/fixture/project" });
    expect(build().options.defaultCwd).toBe("/fixture/project");
  });

  it("preserves the optional cwd outside strict deployments", () => {
    expect(connectWith({}).build().options.defaultCwd).toBeUndefined();
  });

  it.each(["", "relative", " /fixture/project", "/fixture/../project", "/fixture/project/"])(
    "rejects malformed explicit cwd %j before connecting", (cwd) => {
      const { build, connect } = connectWith({ AGENT_RUNTIME_TASK_CWD: cwd });
      expect(build).toThrow(/cwd/u);
      expect(connect).not.toHaveBeenCalled();
    },
  );
});
