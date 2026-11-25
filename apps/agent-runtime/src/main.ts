import { Server, ServerCredentials } from "@grpc/grpc-js";
import {
  AgentRuntimeServiceService,
} from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import "reflect-metadata";

import { createAgentRuntimeGrpcService } from "./agent-runtime-grpc-service";
import { resolveAgentRuntimeSettings } from "./agent-runtime-settings";
import { SubscriptionRuntimeCliExecutor } from "./subscription-runtime-cli-executor";
import { FileSubscriptionRuntimeInstallationInspector } from "./subscription-runtime-installation";
import { isMimoOnly } from "./backend-admission-policy";

export type AgentRuntimeStartupProof = {
  readonly contract: "social-monitor.agent-runtime.startup.v1";
  readonly endpoint: string;
  readonly admission: "strict-mimo-token" | "ordinary";
};

async function bootstrap(): Promise<AgentRuntimeStartupProof> {
  const settings = resolveAgentRuntimeSettings(process.env);
  if (settings.strictAdmission !== undefined) {
    await new FileSubscriptionRuntimeInstallationInspector(settings.strictAdmission.workspaceRoot).inspect(
      settings.cli.command,
      isMimoOnly(settings.strictAdmission.allowedModelBackends) ? "xiaomi-mimo-token-plan" : undefined,
    );
  }
  const server = new Server();
  const executor = new SubscriptionRuntimeCliExecutor(settings.cli);

  server.addService(
    AgentRuntimeServiceService,
    createAgentRuntimeGrpcService(executor, {
      serviceToken: settings.serviceToken,
      strictAdmission: settings.strictAdmission,
    }),
  );

  await new Promise<void>((resolve, reject) => {
    server.bindAsync(
      settings.bindAddress,
      ServerCredentials.createInsecure(),
      (error) => {
        if (error !== null) {
          reject(error);
          return;
        }

        resolve();
      },
    );
  });

  const shutdown = (): void => {
    server.tryShutdown(() => process.exit(0));
    setTimeout(() => {
      server.forceShutdown();
      process.exit(0);
    }, 5_000).unref();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  return {
    contract: "social-monitor.agent-runtime.startup.v1",
    endpoint: settings.bindAddress,
    admission: settings.strictAdmission !== undefined &&
      isMimoOnly(settings.strictAdmission.allowedModelBackends)
      ? "strict-mimo-token" : "ordinary",
  };
}

// The dedicated readiness launcher awaits this real admission and bind result.
export const applicationReady = bootstrap();
