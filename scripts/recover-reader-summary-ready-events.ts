import { relative } from 'node:path';
import { SystemClock } from '@social-monitor/shared-kernel';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { PostgresRuntimePoolRegistry, defaultPostgresRuntimePoolConfig, type PrismaPgRuntimeClientConstructor } from '@social-monitor/platform-persistence';
import { RabbitMqEventPublisher } from '@social-monitor/platform-events/adapters/rabbitmq';
import { AmqplibRabbitMqChannel } from '@social-monitor/platform-queue/adapters/rabbitmq';
import { readSecureRecoveryEvidenceFile, recoveryEvidenceRoot } from './lib/reader-summary-recovery-evidence-secure-file';
import { failureCode, parseRecoveryManifest, requireRecovery } from './lib/reader-summary-ready-recovery-manifest';
import { recoveryPersistence, type RecoveryDatabase } from './lib/reader-summary-ready-recovery-persistence';
import { runReadyRecovery } from './lib/reader-summary-ready-recovery-run';

export function recoveryArguments(args: readonly string[]): { manifestPath: string; apply: boolean } {
  requireRecovery(args.length === 2 || args.length === 3, 'usage_manifest_dry_run_or_apply');
  requireRecovery(args[0] === '--manifest' && args[1]?.startsWith('/') &&
    (args[2] === undefined || args[2] === '--dry-run' || args[2] === '--apply'), 'usage_manifest_dry_run_or_apply');
  return { manifestPath: args[1]!, apply: args[2] === '--apply' };
}
export async function main(args: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
  const { manifestPath, apply } = recoveryArguments(args);
  const required = (key: string): string => { const value = env[key]; requireRecovery(value !== undefined && value.trim(), 'explicit_recovery_config_required'); return value; };
  const reviewedSha256 = required('READER_READY_RECOVERY_MANIFEST_SHA256');
  const deployedSha = required('READER_READY_RECOVERY_DEPLOYED_SHA');
  const databaseUrl = required('READER_READY_RECOVERY_DATABASE_URL');
  const bytes = readSecureRecoveryEvidenceFile({ relativePath: relative(recoveryEvidenceRoot, manifestPath), label: 'reviewed ready manifest' });
  const manifest = parseRecoveryManifest(bytes, reviewedSha256);
  requireRecovery(manifest.deployedSourceSha === deployedSha, 'deployed_source_mismatch');
  const channel = apply ? new AmqplibRabbitMqChannel({ url: required('READER_READY_RECOVERY_RABBITMQ_URL'), socketOptions: { timeout: 5_000 } }) : undefined;
  const Client = loadPrismaRuntimeClient<PrismaPgRuntimeClientConstructor<RecoveryDatabase>>();
  const connection = await new PostgresRuntimePoolRegistry().acquire(defaultPostgresRuntimePoolConfig(databaseUrl, 'event-relay'), Client);
  try {
    const clock = new SystemClock();
    const result = await runReadyRecovery({ bytes, reviewedSha256, deployedSha, apply, clock,
      persistence: recoveryPersistence(connection.client, clock),
      publisher: channel ? new RabbitMqEventPublisher(channel, { exchange: 'social-monitor.events', mandatory: true })
        : { publish: async () => { throw new Error('Dry run cannot publish'); } },
      sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    });
    console.log(JSON.stringify(result));
  } finally { await channel?.close(); await connection.close(); }
}
if (require.main === module) void main(process.argv.slice(2), process.env).catch(error => {
  console.error(JSON.stringify({ error: failureCode(error) })); process.exitCode = 1;
});
