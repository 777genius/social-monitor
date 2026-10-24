import { validateAgentRuntimeDefaultCwd } from "@social-monitor/summary/adapters/model/grpc-agent-runtime-client";

const weeklyAgentRuntimeTrustRoot = "/run/task-workspace";

export const weeklyAgentRuntimeDefaultCwd = (
  value: string | undefined,
): string =>
  value === undefined
    ? weeklyAgentRuntimeTrustRoot
    : validateAgentRuntimeDefaultCwd(value);
