import type { RetentionPolicyRepositoryPort, RetentionPolicySet } from '../../ports';
import { PlanRetentionPurgeUseCase } from './plan-retention-purge.use-case';

class FakeRetentionPolicies implements RetentionPolicyRepositoryPort {
  constructor(private readonly policySet: RetentionPolicySet) {}

  async load(): Promise<RetentionPolicySet> {
    return this.policySet;
  }
}

const policySet = (tables: RetentionPolicySet['tables']): RetentionPolicySet => ({
  schemaVersion: 1,
  defaultLegalHoldBehavior: 'skip_purge_and_record_exception',
  runbook: 'docs/iterations/06-production-hardening/12-operational-runbook.md#retention-and-dsar-triage',
  tables,
});

describe('PlanRetentionPurgeUseCase', () => {
  it('builds deterministic purge plans from retention policies', async () => {
    const useCase = new PlanRetentionPurgeUseCase(new FakeRetentionPolicies(policySet([
      {
        table: 'source_catalog_entries',
        dataClass: 'platform_catalog',
        owner: 'source-platform-owner',
        retentionDays: 0,
        deleteMode: 'retain_until_catalog_deprecated',
        exportable: false,
        legalHoldAware: false,
        purgeTrigger: 'catalog_entry_removed_by_release',
      },
      {
        table: 'source_items',
        dataClass: 'third_party_public_content',
        owner: 'ingestion-owner',
        retentionDays: 180,
        deleteMode: 'hard_delete_or_tombstone_if_referenced',
        exportable: true,
        legalHoldAware: true,
        purgeTrigger: 'source_item_age_expired_or_topic_deleted',
      },
      {
        table: 'idempotency_keys',
        dataClass: 'operational_idempotency_state',
        owner: 'platform-owner',
        retentionDays: 30,
        deleteMode: 'hard_delete_after_expiry',
        exportable: false,
        legalHoldAware: true,
        purgeTrigger: 'idempotency_key_expired',
      },
    ])));

    const result = await useCase.execute({
      now: new Date('2026-06-08T00:00:00.000Z'),
      includeRetainedTables: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        plannedAt: new Date('2026-06-08T00:00:00.000Z'),
        runbook: 'docs/iterations/06-production-hardening/12-operational-runbook.md#retention-and-dsar-triage',
        purgePlans: [
          expect.objectContaining({
            table: 'idempotency_keys',
            eligibleBefore: new Date('2026-05-09T00:00:00.000Z'),
            legalHoldBehavior: 'skip_purge_and_record_exception',
          }),
          expect.objectContaining({
            table: 'source_items',
            eligibleBefore: new Date('2025-12-10T00:00:00.000Z'),
            exportable: true,
          }),
        ],
        retainedTables: [
          expect.objectContaining({
            table: 'source_catalog_entries',
            reason: 'retention_days_zero_requires_manual_or_release_driven_lifecycle',
          }),
        ],
      },
    });
  });

  it('returns validation error for empty policy set', async () => {
    const useCase = new PlanRetentionPurgeUseCase(new FakeRetentionPolicies(policySet([])));

    await expect(useCase.execute({
      now: new Date('2026-06-08T00:00:00.000Z'),
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    });
  });
});
