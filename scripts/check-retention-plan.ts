import { JsonRetentionPolicyRepository } from '@social-monitor/privacy/adapters/retention/json-retention-policy.repository';
import { PlanRetentionPurgeUseCase } from '@social-monitor/privacy/features/plan-retention-purge/plan-retention-purge.use-case';

const run = async (): Promise<void> => {
  const useCase = new PlanRetentionPurgeUseCase(new JsonRetentionPolicyRepository('ops/privacy/retention-contract.json'));
  const result = await useCase.execute({
    now: new Date('2026-06-08T00:00:00.000Z'),
    includeRetainedTables: true,
  });

  if (!result.ok) {
    throw result.error;
  }

  const totalPlannedTables = result.value.purgePlans.length + result.value.retainedTables.length;
  const requiredTables = new Set(['source_items', 'summary_artifacts', 'idempotency_keys', 'source_catalog_entries']);

  for (const table of requiredTables) {
    const isCovered = result.value.purgePlans.some((plan) => plan.table === table) ||
      result.value.retainedTables.some((entry) => entry.table === table);

    if (!isCovered) {
      throw new Error(`Retention plan missing required table "${table}"`);
    }
  }

  if (totalPlannedTables < 20) {
    throw new Error(`Retention plan expected at least 20 tables, got ${totalPlannedTables}`);
  }

  if (result.value.purgePlans.some((plan) => plan.eligibleBefore >= result.value.plannedAt)) {
    throw new Error('Retention purge plan contains an eligibleBefore timestamp that is not before plannedAt');
  }

  console.log('Retention purge plan OK');
};

void run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
