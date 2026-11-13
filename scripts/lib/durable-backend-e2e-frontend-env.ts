import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import type { RunnerConfig } from "./durable-backend-e2e-config";

export function writeFrontendRuntimeEnvFile(
  runnerConfig: Pick<RunnerConfig, "frontendEnvPath" | "apiBaseUrl">,
  auth: Readonly<{ tenantId: string; workspaceId: string; token: string }>,
  runtimeIds: Readonly<{ runId: string; userId: string }>,
): void {
  if (runnerConfig.frontendEnvPath === undefined) {
    return;
  }

  const frontendEnvPath = validatePrivateOutOfWorkspacePath(
    runnerConfig.frontendEnvPath,
    "DURABLE_BACKEND_E2E_FRONTEND_ENV_PATH",
  );
  const lines = [
    "# Generated for local Marionette visual verification only.",
    "# Contains a short-lived backend JWT. Keep outside git and do not commit.",
    `SOCIAL_MONITOR_API_BASE_URL=${shellQuote(runnerConfig.apiBaseUrl)}`,
    `SOCIAL_MONITOR_TENANT_ID=${shellQuote(auth.tenantId)}`,
    `SOCIAL_MONITOR_WORKSPACE_ID=${shellQuote(auth.workspaceId)}`,
    `SOCIAL_MONITOR_TENANT_NAME=${shellQuote(`tenant-${runtimeIds.runId}`)}`,
    `SOCIAL_MONITOR_WORKSPACE_NAME=${shellQuote(
      `workspace-${runtimeIds.runId}`,
    )}`,
    "SOCIAL_MONITOR_WORKSPACE_ROLE='owner'",
    `SOCIAL_MONITOR_USER_ID=${shellQuote(runtimeIds.userId)}`,
    `SOCIAL_MONITOR_USER_LABEL=${shellQuote("MVP Operator")}`,
    `SOCIAL_MONITOR_CORRELATION_ID=${shellQuote(
      `frontend-visual-${runtimeIds.runId}`,
    )}`,
    `SOCIAL_MONITOR_API_BEARER_TOKEN=${shellQuote(auth.token)}`,
  ];

  mkdirSync(dirname(frontendEnvPath), { recursive: true });
  writeFileSync(frontendEnvPath, `${lines.join("\n")}\n`, { mode: 0o600 });
  chmodSync(frontendEnvPath, 0o600);
  console.log(`DURABLE_BACKEND_E2E_FRONTEND_ENV_PATH=${frontendEnvPath}`);
}

function validatePrivateOutOfWorkspacePath(path: string, label: string): string {
  if (!isAbsolute(path)) {
    throw new Error(`${label} must be an absolute path`);
  }

  const resolvedPath = resolve(path);
  const workspaceRelativePath = relative(process.cwd(), resolvedPath);
  if (
    workspaceRelativePath === "" ||
    (!workspaceRelativePath.startsWith(`..${sep}`) &&
      workspaceRelativePath !== "..")
  ) {
    throw new Error(`${label} must not be inside the git workspace`);
  }

  return resolvedPath;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
