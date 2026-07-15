import 'reflect-metadata';

import { createSocialResearchGrpcRuntime } from './social-research-grpc-runtime';
import { resolveSocialResearchGrpcSettings } from './social-research-grpc-settings';

async function main(): Promise<void> {
  const settings = resolveSocialResearchGrpcSettings(process.env);
  const runtime = await createSocialResearchGrpcRuntime(settings);

  const shutdown = (): void => {
    void runtime.close().finally(() => {
      process.exit(0);
    });
    setTimeout(() => {
      runtime.server.forceShutdown();
      process.exit(0);
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
