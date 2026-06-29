import {
  DomainError,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';
import { BindSourceUseCase } from '@social-monitor/monitoring/features/bind-source/bind-source.use-case';
import { CreateInterestUseCase } from '@social-monitor/monitoring/features/create-interest/create-interest.use-case';
import {
  providerScanCadenceProfile,
} from '@social-monitor/monitoring/features/shared/scan-cadence-policy';
import { SetScanPolicyUseCase } from '@social-monitor/monitoring/features/set-scan-policy/set-scan-policy.use-case';
import type {
  SourceBindingConfig,
  SourceBindingConfigValue,
} from '@social-monitor/monitoring/ports';

import type { SourceTargetCatalogPort, SourceTargetDescriptor } from '../../ports';
import { CreateUserSubscriptionUseCase } from '../create-user-subscription/create-user-subscription.use-case';
import type { ActivateInterestSourceCommand } from './activate-interest-source.command';
import type { ActivateInterestSourceResult } from './activate-interest-source.result';

type ActivateInterestSourceFailure = DomainError | Error;

type CreateUserSubscriptionWorkflow = Pick<CreateUserSubscriptionUseCase, 'execute'>;
type CreateInterestWorkflow = Pick<CreateInterestUseCase, 'execute'>;
type BindSourceWorkflow = Pick<BindSourceUseCase, 'execute'>;
type SetScanPolicyWorkflow = Pick<SetScanPolicyUseCase, 'execute'>;

export class ActivateInterestSourceUseCase {
  constructor(
    private readonly createUserSubscription: CreateUserSubscriptionWorkflow,
    private readonly createInterest: CreateInterestWorkflow,
    private readonly bindSource: BindSourceWorkflow,
    private readonly setScanPolicy: SetScanPolicyWorkflow,
    private readonly targetCatalog: SourceTargetCatalogPort,
  ) {}

  async execute(
    command: ActivateInterestSourceCommand,
  ): Promise<Result<ActivateInterestSourceResult, ActivateInterestSourceFailure>> {
    if (command.idempotencyKey.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Activation idempotency key must be non-empty'));
    }

    const validation = this.targetCatalog.validateTarget({
      providerKey: command.providerKey,
      targetKind: command.targetKind,
      targetValue: command.targetValue,
      config: command.targetConfig,
    });
    if (!validation.ok) {
      return err(new DomainError('validation.failed', validation.reason));
    }

    const descriptor = validation.descriptor;
    const sourceQuery = sourceQueryForTarget(descriptor);
    const interestResult = await this.createInterest.execute({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      name: interestNameForTarget(descriptor),
      query: sourceQuery,
      idempotencyKey: scopedKey(command.idempotencyKey, 'interest', descriptor.normalizedKey),
      correlationId: command.correlationId,
    });
    if (!interestResult.ok) {
      return err(interestResult.error);
    }

    const bindingResult = await this.bindSource.execute({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      interestId: interestResult.value.interestId,
      providerKey: descriptor.providerKey,
      config: sourceBindingConfigForTarget(descriptor, sourceQuery),
      idempotencyKey: scopedKey(command.idempotencyKey, 'source-binding', descriptor.normalizedKey),
      correlationId: command.correlationId,
    });
    if (!bindingResult.ok) {
      return err(bindingResult.error);
    }

    const scanPolicy = activationScanPolicy(command, descriptor.providerKey);
    const policyResult = await this.setScanPolicy.execute({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: bindingResult.value.sourceBindingId,
      intervalSeconds: scanPolicy.intervalSeconds,
      freshnessSeconds: scanPolicy.freshnessSeconds,
      retryBudget: scanPolicy.retryBudget,
      idempotencyKey: scopedKey(command.idempotencyKey, 'scan-policy', descriptor.normalizedKey),
      correlationId: command.correlationId,
    });
    if (!policyResult.ok) {
      return err(policyResult.error);
    }

    const subscriptionResult = await this.createUserSubscription.execute({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      userId: command.userId,
      providerKey: command.providerKey,
      targetKind: command.targetKind,
      targetValue: command.targetValue,
      targetConfig: command.targetConfig,
      schedule: command.schedule,
      summaryPreference: command.summaryPreference,
    });
    if (!subscriptionResult.ok) {
      return err(subscriptionResult.error);
    }

    return ok({
      ...subscriptionResult.value,
      interestId: interestResult.value.interestId,
      sourceBindingId: bindingResult.value.sourceBindingId,
      scanPolicyId: policyResult.value.scanPolicyId,
      activation: {
        interestCreated: interestResult.value.created,
        sourceBindingCreated: bindingResult.value.created,
        scanPolicyCreated: policyResult.value.created,
        scanPolicyUpdated: policyResult.value.updated,
      },
    });
  }
}

const sourceQueryForTarget = (descriptor: SourceTargetDescriptor): string => {
  if (descriptor.providerKey === 'x-twitter' && descriptor.targetKind === 'account') {
    return `from:${descriptor.targetValue}`;
  }

  return descriptor.targetValue;
};

const interestNameForTarget = (descriptor: SourceTargetDescriptor): string =>
  descriptor.targetKind === 'account'
    ? `@${descriptor.targetValue}`
    : descriptor.targetValue;

const sourceBindingConfigForTarget = (
  descriptor: SourceTargetDescriptor,
  sourceQuery: string,
): SourceBindingConfig => {
  if (descriptor.providerKey === 'x-twitter') {
    return xTwitterSourceBindingConfig(descriptor.config, sourceQuery);
  }

  return normalizeSourceBindingConfig({
    ...descriptor.config,
    mode: descriptor.targetKind === 'url' ? 'url' : 'search',
    query: sourceQuery,
  });
};

const xTwitterSourceBindingConfig = (
  config: Readonly<Record<string, unknown>>,
  sourceQuery: string,
): SourceBindingConfig => ({
  mode: 'search',
  query: sourceQuery,
  windowHours: readBoundedInteger(config.windowHours, 24, 1, 72),
  searchProducts: readSearchProducts(config.searchProducts),
  maxItems: readBoundedInteger(config.maxItems, 25, 1, 100),
  limitPerProduct: readBoundedInteger(config.limitPerProduct, 50, 1, 100),
  minLikes: readBoundedInteger(config.minLikes, 1, 0, 1_000_000),
  minRetweets: readBoundedInteger(config.minRetweets, 0, 0, 1_000_000),
  minReplies: readBoundedInteger(config.minReplies, 0, 0, 1_000_000),
  ...(readOptionalString(config.language) === undefined
    ? {}
    : { language: readOptionalString(config.language) }),
});

const activationScanPolicy = (
  command: ActivateInterestSourceCommand,
  providerKey: string,
): {
  readonly intervalSeconds: number;
  readonly freshnessSeconds: number;
  readonly retryBudget: number;
} => {
  const profile = providerScanCadenceProfile(providerKey);
  const requestedInterval =
    command.scanPolicy?.intervalSeconds ?? profile.defaultIntervalSeconds;
  const intervalSeconds = Math.max(requestedInterval, profile.minimumIntervalSeconds);

  return {
    intervalSeconds,
    freshnessSeconds: Math.max(
      command.scanPolicy?.freshnessSeconds ?? profile.defaultFreshnessSeconds,
      intervalSeconds,
    ),
    retryBudget: command.scanPolicy?.retryBudget ?? profile.defaultRetryBudget,
  };
};

const scopedKey = (
  idempotencyKey: string,
  scope: string,
  normalizedKey: string,
): string => `${idempotencyKey.trim()}:${scope}:${normalizedKey}`;

const readSearchProducts = (value: unknown): readonly SourceBindingConfigValue[] => {
  if (!Array.isArray(value)) {
    return ['top', 'latest'];
  }

  const products = value.filter(
    (item): item is 'top' | 'latest' => item === 'top' || item === 'latest',
  );

  return products.length === 0 ? ['top', 'latest'] : [...new Set(products)];
};

const readOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;

const readBoundedInteger = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, minimum), maximum);
};

const normalizeSourceBindingConfig = (
  value: Readonly<Record<string, unknown>>,
): SourceBindingConfig =>
  Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, normalizeConfigValue(entry)]),
  );

const normalizeConfigValue = (value: unknown): SourceBindingConfigValue => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeConfigValue(item));
  }

  if (typeof value === 'object') {
    return normalizeSourceBindingConfig(value as Readonly<Record<string, unknown>>);
  }

  return String(value);
};
