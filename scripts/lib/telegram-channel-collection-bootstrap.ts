import { telegramPublicChannel } from '@social-monitor/ingestion/domain/value-objects/telegram-public-channel';
import type { SourceBinding } from '@social-monitor/monitoring/domain';
import type { BindSourceUseCase } from '@social-monitor/monitoring/features/bind-source/bind-source.use-case';
import type { SetScanPolicyUseCase } from '@social-monitor/monitoring/features/set-scan-policy/set-scan-policy.use-case';
import type { InterestRepositoryPort, ScanPolicyRepositoryPort, SourceBindingRepositoryPort } from '@social-monitor/monitoring/ports';
import {
  assertTelegramBinding, assertTelegramPolicy, telegramCollectionChannel, telegramCollectionConfig,
  telegramCollectionPolicy, telegramCollectionScope, TelegramCollectionError,
  type TelegramCollectionMode, type TelegramCollectionTarget,
} from './telegram-channel-collection-contract';

export type TelegramCollectionMonitoring = {
  readonly interests: InterestRepositoryPort;
  readonly bindings: SourceBindingRepositoryPort;
  readonly policies: ScanPolicyRepositoryPort;
  readonly catalog: { inspect(): Promise<boolean>; ensure(): Promise<void> };
  readonly bootstrap?: {
    readonly bindSource: Pick<BindSourceUseCase, 'execute'>;
    readonly setPolicy: Pick<SetScanPolicyUseCase, 'execute'>;
  };
};
export type TelegramCollectionInspection = {
  readonly catalogReady: boolean;
  readonly sourceBindingId?: string;
  readonly scanPolicyId?: string;
  readonly target?: TelegramCollectionTarget;
};

export const resolveTelegramCollectionTarget = async (
  mode: TelegramCollectionMode, monitoring: TelegramCollectionMonitoring,
): Promise<TelegramCollectionInspection> => {
  const interest = await monitoring.interests.findById(telegramCollectionScope);
  const interestSnapshot = interest?.toSnapshot();
  if (interestSnapshot === undefined || interestSnapshot.id !== telegramCollectionScope.interestId ||
      interestSnapshot.tenantId !== telegramCollectionScope.tenantId || interestSnapshot.workspaceId !== telegramCollectionScope.workspaceId) {
    throw new TelegramCollectionError('interest_missing');
  }
  let binding = await findTargetBinding(monitoring.bindings);
  let policy = binding === null ? null : await monitoring.policies.findBySourceBinding({
    ...telegramCollectionScope, sourceBindingId: binding.toSnapshot().id,
  });
  if (binding !== null) assertTelegramBinding(binding);
  if (binding !== null && policy !== null) assertTelegramPolicy(policy, binding.toSnapshot().id);
  let catalogReady = await monitoring.catalog.inspect();
  if (mode === 'bootstrap') {
    if (monitoring.bootstrap === undefined) throw new TelegramCollectionError('runtime_failed');
    await monitoring.catalog.ensure();
    catalogReady = true;
    if (binding === null) {
      const result = await monitoring.bootstrap.bindSource.execute({
        ...telegramCollectionScope, providerKey: 'telegram', config: telegramCollectionConfig,
        idempotencyKey: 'telegram-hiaimediaen-bootstrap-v1', correlationId: 'telegram-channel-collection-bootstrap',
      });
      if (!result.ok) throw new TelegramCollectionError('binding_conflict');
      binding = await monitoring.bindings.findById({ ...telegramCollectionScope, sourceBindingId: result.value.sourceBindingId });
      if (binding === null) throw new TelegramCollectionError('binding_conflict');
      assertTelegramBinding(binding);
    }
    if (policy === null) {
      const sourceBindingId = binding.toSnapshot().id;
      const result = await monitoring.bootstrap.setPolicy.execute({
        ...telegramCollectionScope, sourceBindingId, ...telegramCollectionPolicy,
        idempotencyKey: `telegram-hiaimediaen-policy-v1:${sourceBindingId}`, correlationId: 'telegram-channel-collection-bootstrap',
      });
      if (!result.ok) throw new TelegramCollectionError('policy_conflict');
      policy = await monitoring.policies.findBySourceBinding({ ...telegramCollectionScope, sourceBindingId });
      if (policy === null) throw new TelegramCollectionError('policy_conflict');
      assertTelegramPolicy(policy, sourceBindingId);
    }
  }
  const target = binding === null || policy === null || !catalogReady ? undefined : {
    sourceBindingId: binding.toSnapshot().id, scanPolicyId: policy.toSnapshot().id, interestQuery: interestSnapshot.query,
  };
  if (mode === 'collect' && target === undefined) throw new TelegramCollectionError('not_bootstrapped');
  return {
    catalogReady, sourceBindingId: binding?.toSnapshot().id, scanPolicyId: policy?.toSnapshot().id, target,
  };
};

const findTargetBinding = async (repository: SourceBindingRepositoryPort): Promise<SourceBinding | null> => {
  let cursor: string | undefined;
  let found: SourceBinding | null = null;
  for (let page = 0; page < 10; page += 1) {
    const result = await repository.listByInterest({ ...telegramCollectionScope, providerKeys: ['telegram'], limit: 100, cursor });
    for (const binding of result.sourceBindings) {
      const snapshot = binding.toSnapshot();
      if (snapshot.providerKey !== 'telegram' || snapshot.tenantId !== telegramCollectionScope.tenantId ||
          snapshot.workspaceId !== telegramCollectionScope.workspaceId || snapshot.interestId !== telegramCollectionScope.interestId) {
        throw new TelegramCollectionError('binding_conflict');
      }
      const channels = ['channel', 'query', 'url'].flatMap((key) => {
        const value = snapshot.config[key];
        return typeof value === 'string' ? [telegramPublicChannel(value)] : [];
      });
      if (channels.length === 0 || channels.some((channel) => channel === undefined)) throw new TelegramCollectionError('binding_conflict');
      if (!channels.includes(telegramCollectionChannel)) continue;
      if (found !== null) throw new TelegramCollectionError('binding_conflict');
      assertTelegramBinding(binding);
      found = binding;
    }
    if (result.nextCursor === undefined) return found;
    cursor = result.nextCursor;
  }
  throw new TelegramCollectionError('binding_conflict');
};
