import 'reflect-metadata';
import { bindPostgresRuntimeProcessIdentity } from '@social-monitor/platform-persistence';

import { createSocialResearchGrpcRuntime } from './social-research-grpc-runtime';
import { resolveSocialResearchGrpcSettings } from './social-research-grpc-settings';

async function main(): Promise<void> {
  bindPostgresRuntimeProcessIdentity(process.env, 'social-research-grpc');
  const settings = resolveSocialResearchGrpcSettings(process.env);
  const runtime = await createSocialResearchGrpcRuntime(settings);
  let shutdownPromise: Promise<void> | undefined;

  const shutdown = (): void => {
    shutdownPromise ??= runtime
      .close()
      .catch((error: unknown) => {
        reportShutdownFailure('social research gRPC', error);
      })
      .finally(() => {
        process.exit(process.exitCode ?? 0);
      });
    void shutdownPromise;
    setTimeout(() => {
      runtime.server.forceShutdown();
      process.exit(process.exitCode ?? 1);
    }, 5_000).unref();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown social research gRPC error';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

function reportShutdownFailure(runtimeName: string, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Unknown shutdown error';
  process.stderr.write(`${runtimeName} shutdown failed: ${message}\n`);
  process.exitCode = 1;
}
