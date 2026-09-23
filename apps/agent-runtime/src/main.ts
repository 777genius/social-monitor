import { Server, ServerCredentials } from "@grpc/grpc-js";
import {
  AgentRuntimeServiceService,
} from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import "reflect-metadata";

import { createAgentRuntimeGrpcService } from "./agent-runtime-grpc-service";
import { resolveAgentRuntimeSettings } from "./agent-runtime-settings";
import { SubscriptionRuntimeCliExecutor } from "./subscription-runtime-cli-executor";
import { FileSubscriptionRuntimeInstallationInspector } from "./subscription-runtime-installation";

async function bootstrap(): Promise<void> {
  const settings = resolveAgentRuntimeSettings(process.env);
  if (settings.strictAdmission !== undefined) {
    await new FileSubscriptionRuntimeInstallationInspector().inspect(settings.cli.command);
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
}

void bootstrap();
