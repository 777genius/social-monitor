import { weeklyAgentRuntimeDefaultCwd } from "./weekly-agent-runtime-default-cwd";

describe("weeklyAgentRuntimeDefaultCwd", () => {
  it("falls back to the agent-runtime trust root when the env is unset", () => {
    expect(weeklyAgentRuntimeDefaultCwd(undefined)).toBe(
      "/run/task-workspace",
    );
  });

  it("keeps a configured trusted task cwd", () => {
    expect(weeklyAgentRuntimeDefaultCwd("/fixture/project")).toBe(
      "/fixture/project",
    );
  });

  it("rejects a malformed configured cwd instead of silently falling back", () => {
    expect(() => weeklyAgentRuntimeDefaultCwd("")).toThrow(
      "Agent runtime default cwd must be a lexical absolute path",
    );
    expect(() => weeklyAgentRuntimeDefaultCwd("relative/path")).toThrow(
      "Agent runtime default cwd must be a lexical absolute path",
    );
    expect(() => weeklyAgentRuntimeDefaultCwd("/run/task-workspace/")).toThrow(
      "Agent runtime default cwd must be a lexical absolute path",
    );
  });
});
