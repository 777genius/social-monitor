import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { SourceBinding, ScanPolicy } from '@social-monitor/monitoring/domain';

export const telegramCollectionScope = Object.freeze({
  tenantId: tenantId('00000000-0000-7000-8000-000000006101'),
  workspaceId: workspaceId('00000000-0000-7000-8000-000000006102'),
  interestId: '00000000-0000-7000-8000-000000006105',
});
export const telegramCollectionChannel = 'hiaimediaen';
export const telegramCollectionConfig = Object.freeze({
  channel: telegramCollectionChannel, mode: 'account_feed', maxItemAgeHours: 24, maxItems: 50, maxPages: 5,
});
export const telegramCollectionPolicy = Object.freeze({ intervalSeconds: 3600, freshnessSeconds: 3600, retryBudget: 0 });
export type TelegramCollectionMode = 'inspect' | 'bootstrap' | 'collect';
export type TelegramCollectionOperationalState = {
  readonly fetchFailed: boolean;
  readonly failureReported: boolean;
};
export class TelegramCollectionError extends Error {
  constructor(readonly code: 'invalid_arguments' | 'beta_required' | 'database_required' | 'interest_missing' |
    'binding_conflict' | 'policy_conflict' | 'catalog_conflict' | 'not_bootstrapped' | 'collection_failed' | 'runtime_failed') {
    super(code);
  }
}

export const parseTelegramCollectionArgs = (args: readonly string[]): TelegramCollectionMode => {
  const values = new Map<string, string>();
  let mode: TelegramCollectionMode = 'inspect';
  let selectedMode = false;
  const exact = new Map([
    ['--channel', telegramCollectionChannel], ['--tenant-id', String(telegramCollectionScope.tenantId)],
    ['--workspace-id', String(telegramCollectionScope.workspaceId)], ['--interest-id', telegramCollectionScope.interestId],
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]!;
    if (['--inspect', '--bootstrap', '--collect'].includes(key)) {
      if (selectedMode) throw new TelegramCollectionError('invalid_arguments');
      mode = key.slice(2) as TelegramCollectionMode;
      selectedMode = true;
    } else {
      const value = args[++index];
      if (value === undefined || !exact.has(key) || values.has(key) || value !== exact.get(key)) throw new TelegramCollectionError('invalid_arguments');
      values.set(key, value);
    }
  }
  return mode;
};

export const assertTelegramBinding = (binding: SourceBinding): void => {
  const value = binding.toSnapshot();
  const expected = telegramCollectionConfig;
  if (value.tenantId !== telegramCollectionScope.tenantId || value.workspaceId !== telegramCollectionScope.workspaceId ||
      value.interestId !== telegramCollectionScope.interestId || value.providerKey !== 'telegram' ||
      value.status !== 'enabled' || value.capabilityProfileVersion !== 1 ||
      Object.keys(value.config).length !== Object.keys(expected).length ||
      Object.entries(expected).some(([key, expectedValue]) => value.config[key] !== expectedValue)) {
    throw new TelegramCollectionError('binding_conflict');
  }
};
export const assertTelegramPolicy = (policy: ScanPolicy, sourceBindingId: string): void => {
  const value = policy.toSnapshot();
  if (value.tenantId !== telegramCollectionScope.tenantId || value.workspaceId !== telegramCollectionScope.workspaceId ||
      value.sourceBindingId !== sourceBindingId || !policy.hasConfiguration(telegramCollectionPolicy)) {
    throw new TelegramCollectionError('policy_conflict');
  }
};

export type TelegramCollectionTarget = {
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly interestQuery: string;
};
