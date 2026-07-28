import {
  runWithSystemDatabaseAccess,
  withPrismaWriteRetry,
} from '@social-monitor/platform-persistence';
import {
  SystemClock,
  tenantId,
  workspaceId,
  type Clock,
  type TenantId,
  type WorkspaceId,
} from '@social-monitor/shared-kernel';

import { PrismaInterestRepository } from '../../libs/monitoring/adapters/persistence/prisma/prisma-interest.repository';
import type { PrismaMonitoringClient } from '../../libs/monitoring/adapters/persistence/prisma/prisma-monitoring-client';
import { PrismaScanPolicyRepository } from '../../libs/monitoring/adapters/persistence/prisma/prisma-scan-policy.repository';
import { PrismaSourceBindingRepository } from '../../libs/monitoring/adapters/persistence/prisma/prisma-source-binding.repository';
import { AesGcmSourceBindingConfigProtector } from '../../libs/monitoring/adapters/security/aes-gcm-source-binding-config-protector';
import {
  FakeSourceCatalogAdapter,
  sourceCatalogOptionsForRuntime,
} from '../../libs/monitoring/adapters/source-catalog/fake-source-catalog.adapter';
import {
  Interest,
  ScanPolicy,
  SourceBinding,
} from '../../libs/monitoring/domain';
import { providerScanCadenceProfile } from '../../libs/monitoring/features/shared/scan-cadence-policy';
import type {
  InterestRepositoryPort,
  ScanPolicyRepositoryPort,
  SourceBindingConfig,
  SourceBindingConfigProtectorPort,
  SourceBindingRepositoryPort,
  SourceCatalogPort,
} from '../../libs/monitoring/ports';
import { aiDeveloperSignalSourcePreset } from '../../libs/subscriptions/domain';

export const readerSummaryProductionProviderKeys = [
  'github-trending-page',
  'hacker-news',
  'reddit',
  'rss',
  'x-twitter',
] as const;

export type ReaderSummaryProductionProviderKey =
  (typeof readerSummaryProductionProviderKeys)[number];

const scopeDefinition = {
  tenant: {
    id: '00000000-0000-7000-8000-000000006101',
    slug: 'reader-summary-production',
    name: 'Reader Summary Production',
  },
  workspace: {
    id: '00000000-0000-7000-8000-000000006102',
    slug: 'ai-developer-signal',
    name: 'AI Developer Signal',
  },
  user: {
    id: '00000000-0000-7000-8000-000000006103',
    email: 'reader-summary-production@social-monitor.invalid',
    displayName: 'Reader Summary Production',
  },
  membershipId: '00000000-0000-7000-8000-000000006104',
  interest: {
    id: '00000000-0000-7000-8000-000000006105',
    name: 'AI developer signal',
    query:
      'AI agents, LLM tooling, developer tools, Flutter, Dart, TypeScript, Python, open source AI, and cybersecurity',
  },
} as const;

const sourceBindingIds: Record<ReaderSummaryProductionProviderKey, string> = {
  'github-trending-page': '00000000-0000-7000-8000-000000006111',
  'hacker-news': '00000000-0000-7000-8000-000000006112',
  reddit: '00000000-0000-7000-8000-000000006113',
  rss: '00000000-0000-7000-8000-000000006114',
  'x-twitter': '00000000-0000-7000-8000-000000006115',
};

const scanPolicyIds: Record<ReaderSummaryProductionProviderKey, string> = {
  'github-trending-page': '00000000-0000-7000-8000-000000006121',
  'hacker-news': '00000000-0000-7000-8000-000000006122',
  reddit: '00000000-0000-7000-8000-000000006123',
  rss: '00000000-0000-7000-8000-000000006124',
  'x-twitter': '00000000-0000-7000-8000-000000006125',
};

export type ReaderSummaryProductionScope = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
};

export interface ReaderSummaryProductionIdentityStore {
  ensureScope(): Promise<ReaderSummaryProductionScope>;
}

export interface ReaderSummaryProductionCatalogCapabilityReader {
  findCapability(params: {
    readonly providerKey: ReaderSummaryProductionProviderKey;
    readonly version: number;
  }): Promise<{ readonly productionSafe: boolean } | null>;
}

export type ReaderSummaryProductionSourceBootstrapDependencies = {
  readonly identities: ReaderSummaryProductionIdentityStore;
  readonly interests: InterestRepositoryPort;
  readonly sourceBindings: SourceBindingRepositoryPort;
  readonly scanPolicies: ScanPolicyRepositoryPort;
  readonly sourceCatalog: SourceCatalogPort;
  readonly catalogCapabilities: ReaderSummaryProductionCatalogCapabilityReader;
  readonly configProtector: SourceBindingConfigProtectorPort;
  readonly clock: Clock;
};

export type ReaderSummaryProductionSourceBootstrapResult = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly interestId: string;
  readonly providers: readonly {
    readonly providerKey: ReaderSummaryProductionProviderKey;
    readonly sourceBindingId: string;
    readonly scanPolicyId: string;
    readonly sourceBindingCreated: boolean;
    readonly scanPolicyCreated: boolean;
    readonly scanPolicyUpdated: boolean;
  }[];
};

type ProviderPlan = {
  readonly providerKey: ReaderSummaryProductionProviderKey;
  readonly config: SourceBindingConfig;
};

type BootstrapTransaction = {
  readonly tenant: {
    upsert(args: {
      readonly where: { readonly slug: string };
      readonly update: { readonly name: string; readonly deletedAt: null };
      readonly create: {
        readonly id: string;
        readonly slug: string;
        readonly name: string;
      };
    }): Promise<{ readonly id: string }>;
  };
  readonly workspace: {
    upsert(args: {
      readonly where: {
        readonly tenantId_slug: {
          readonly tenantId: string;
          readonly slug: string;
        };
      };
      readonly update: { readonly name: string; readonly deletedAt: null };
      readonly create: {
        readonly id: string;
        readonly tenantId: string;
        readonly slug: string;
        readonly name: string;
      };
    }): Promise<{ readonly id: string }>;
  };
  readonly user: {
    upsert(args: {
      readonly where: {
        readonly tenantId_email: {
          readonly tenantId: string;
          readonly email: string;
        };
      };
      readonly update: {
        readonly displayName: string;
        readonly deletedAt: null;
      };
      readonly create: {
        readonly id: string;
        readonly tenantId: string;
        readonly email: string;
        readonly displayName: string;
      };
    }): Promise<{ readonly id: string }>;
  };
  readonly membership: {
    upsert(args: {
      readonly where: {
        readonly tenantId_workspaceId_userId: {
          readonly tenantId: string;
          readonly workspaceId: string;
          readonly userId: string;
        };
      };
      readonly update: { readonly role: 'OWNER' };
      readonly create: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly userId: string;
        readonly role: 'OWNER';
      };
    }): Promise<unknown>;
  };
};

export type ReaderSummaryProductionBootstrapPrismaClient = {
  $transaction<TValue>(
    work: (transaction: BootstrapTransaction) => Promise<TValue>,
    options: { readonly isolationLevel: 'Serializable' },
  ): Promise<TValue>;
  readonly sourceCatalogEntry: {
    findUnique(args: {
      readonly where: { readonly providerKey: string };
    }): Promise<{ readonly id: string } | null>;
  };
  readonly capabilityProfile: {
    findUnique(args: {
      readonly where: {
        readonly sourceId_version: {
          readonly sourceId: string;
          readonly version: number;
        };
      };
    }): Promise<{ readonly config: unknown } | null>;
  };
};

export async function bootstrapReaderSummaryProductionSources(
  dependencies: ReaderSummaryProductionSourceBootstrapDependencies,
): Promise<ReaderSummaryProductionSourceBootstrapResult> {
  const plans = productionProviderPlans();
  const capabilities = await preflightCapabilities(dependencies, plans);
  const protectedConfigs = await Promise.all(
    plans.map((plan) => dependencies.configProtector.protect(plan.config)),
  );
  const scope = await dependencies.identities.ensureScope();
  const interest = await ensureInterest(dependencies, scope);

  await assertExactExistingProviderSet(
    dependencies.sourceBindings,
    scope,
    interest.toSnapshot().id,
  );

  const providers = [];
  for (const [index, plan] of plans.entries()) {
    const capability = capabilities[index];
    if (capability === undefined) {
      throw new Error(`Capability preflight result is missing for ${plan.providerKey}`);
    }
    const config = protectedConfigs[index];
    if (config === undefined) {
      throw new Error(`Protected source config is missing for ${plan.providerKey}`);
    }

    providers.push(
      await ensureProvider(
        dependencies,
        scope,
        interest.toSnapshot().id,
        plan.providerKey,
        capability.version,
        config,
      ),
    );
  }

  await verifyBootstrapState(dependencies, scope, interest.toSnapshot().id);

  return {
    ...scope,
    interestId: interest.toSnapshot().id,
    providers,
  };
}

export async function bootstrapReaderSummaryProductionSourcesWithPrisma(
  prisma: ReaderSummaryProductionBootstrapPrismaClient,
  env: NodeJS.ProcessEnv,
): Promise<ReaderSummaryProductionSourceBootstrapResult> {
  const monitoringClient = prisma as unknown as PrismaMonitoringClient;
  const dependencies: ReaderSummaryProductionSourceBootstrapDependencies = {
    identities: new PrismaReaderSummaryProductionIdentityStore(prisma),
    interests: new PrismaInterestRepository(monitoringClient),
    sourceBindings: new PrismaSourceBindingRepository(monitoringClient),
    scanPolicies: new PrismaScanPolicyRepository(monitoringClient),
    sourceCatalog: new FakeSourceCatalogAdapter(
      sourceCatalogOptionsForRuntime(env),
    ),
    catalogCapabilities:
      new PrismaReaderSummaryProductionCatalogCapabilityReader(prisma),
    configProtector:
      AesGcmSourceBindingConfigProtector.fromEnvironment(env),
    clock: new SystemClock(),
  };

  return runWithSystemDatabaseAccess(
    'reader summary production source bootstrap',
    () => bootstrapReaderSummaryProductionSources(dependencies),
  );
}

export class PrismaReaderSummaryProductionIdentityStore
  implements ReaderSummaryProductionIdentityStore
{
  constructor(
    private readonly prisma: Pick<
      ReaderSummaryProductionBootstrapPrismaClient,
      '$transaction'
    >,
  ) {}

  ensureScope(): Promise<ReaderSummaryProductionScope> {
    return withPrismaWriteRetry(() =>
      this.prisma.$transaction(async (transaction) => {
        const tenant = await transaction.tenant.upsert({
          where: { slug: scopeDefinition.tenant.slug },
          update: {
            name: scopeDefinition.tenant.name,
            deletedAt: null,
          },
          create: scopeDefinition.tenant,
        });
        const workspace = await transaction.workspace.upsert({
          where: {
            tenantId_slug: {
              tenantId: tenant.id,
              slug: scopeDefinition.workspace.slug,
            },
          },
          update: {
            name: scopeDefinition.workspace.name,
            deletedAt: null,
          },
          create: {
            ...scopeDefinition.workspace,
            tenantId: tenant.id,
          },
        });
        const user = await transaction.user.upsert({
          where: {
            tenantId_email: {
              tenantId: tenant.id,
              email: scopeDefinition.user.email,
            },
          },
          update: {
            displayName: scopeDefinition.user.displayName,
            deletedAt: null,
          },
          create: {
            ...scopeDefinition.user,
            tenantId: tenant.id,
          },
        });
        await transaction.membership.upsert({
          where: {
            tenantId_workspaceId_userId: {
              tenantId: tenant.id,
              workspaceId: workspace.id,
              userId: user.id,
            },
          },
          update: { role: 'OWNER' },
          create: {
            id: scopeDefinition.membershipId,
            tenantId: tenant.id,
            workspaceId: workspace.id,
            userId: user.id,
            role: 'OWNER',
          },
        });

        return {
          tenantId: tenantId(tenant.id),
          workspaceId: workspaceId(workspace.id),
          userId: user.id,
        };
      }, { isolationLevel: 'Serializable' }),
    );
  }
}

export class PrismaReaderSummaryProductionCatalogCapabilityReader
  implements ReaderSummaryProductionCatalogCapabilityReader
{
  constructor(
    private readonly prisma: Pick<
      ReaderSummaryProductionBootstrapPrismaClient,
      'sourceCatalogEntry' | 'capabilityProfile'
    >,
  ) {}

  async findCapability(params: {
    readonly providerKey: ReaderSummaryProductionProviderKey;
    readonly version: number;
  }): Promise<{ readonly productionSafe: boolean } | null> {
    const source = await this.prisma.sourceCatalogEntry.findUnique({
      where: { providerKey: params.providerKey },
    });
    if (source === null) {
      return null;
    }

    const profile = await this.prisma.capabilityProfile.findUnique({
      where: {
        sourceId_version: {
          sourceId: source.id,
          version: params.version,
        },
      },
    });
    if (profile === null) {
      return null;
    }

    return {
      productionSafe:
        isRecord(profile.config) && profile.config.productionSafe === true,
    };
  }
}

const productionProviderPlans = (): readonly ProviderPlan[] => {
  const presetByProvider = new Map(
    aiDeveloperSignalSourcePreset.entries.map((entry) => [
      entry.providerKey,
      entry,
    ]),
  );

  return readerSummaryProductionProviderKeys.map(
    (providerKey): ProviderPlan => {
      if (providerKey === 'github-trending-page') {
        return {
          providerKey,
          config: {
            mode: 'listing',
            query: 'daily',
            window: 'daily',
            maxItems: 100,
          },
        };
      }

      const entry = presetByProvider.get(providerKey);
      if (entry === undefined) {
        throw new Error(`AI developer source preset is missing ${providerKey}`);
      }
      const targetConfig = entry.targetConfig as SourceBindingConfig;

      return {
        providerKey,
        config: {
          ...targetConfig,
          mode: entry.targetKind === 'url' ? 'url' : 'search',
          query: entry.targetValue,
          ...(entry.targetKind === 'url'
            ? { feedUrl: entry.targetValue }
            : {}),
        },
      };
    },
  );
};

const preflightCapabilities = async (
  dependencies: ReaderSummaryProductionSourceBootstrapDependencies,
  plans: readonly ProviderPlan[],
): Promise<
  readonly { readonly providerKey: string; readonly version: number }[]
> =>
  Promise.all(
    plans.map(async (plan) => {
      const runtimeCapability =
        await dependencies.sourceCatalog.getCapability(plan.providerKey);
      if (runtimeCapability === null || !runtimeCapability.productionSafe) {
        throw new Error(
          `Production runtime capability is unavailable for ${plan.providerKey}`,
        );
      }

      const configValidation =
        await dependencies.sourceCatalog.validateBindingConfig(
          plan.providerKey,
          plan.config,
        );
      if (!configValidation.ok) {
        throw new Error(
          `Production source config is invalid for ${plan.providerKey}: ${configValidation.reason}`,
        );
      }

      const persistedCapability =
        await dependencies.catalogCapabilities.findCapability({
          providerKey: plan.providerKey,
          version: runtimeCapability.version,
        });
      if (
        persistedCapability === null ||
        !persistedCapability.productionSafe
      ) {
        throw new Error(
          `Production catalog capability is unavailable for ${plan.providerKey} version ${runtimeCapability.version}`,
        );
      }

      return {
        providerKey: runtimeCapability.providerKey,
        version: runtimeCapability.version,
      };
    }),
  );

const ensureInterest = async (
  dependencies: ReaderSummaryProductionSourceBootstrapDependencies,
  scope: ReaderSummaryProductionScope,
): Promise<Interest> => {
  const existing = await dependencies.interests.findByName({
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    name: scopeDefinition.interest.name,
  });
  if (existing !== null) {
    const snapshot = existing.toSnapshot();
    if (snapshot.query === scopeDefinition.interest.query) {
      return existing;
    }

    const updated = existing.updateDetails(scopeDefinition.interest);
    await dependencies.interests.save(updated);
    return updated;
  }

  const interest = Interest.create({
    ...scopeDefinition.interest,
    id: scopeDefinition.interest.id,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    createdAt: dependencies.clock.now(),
  });
  await dependencies.interests.save(interest);
  return interest;
};

const assertExactExistingProviderSet = async (
  sourceBindings: SourceBindingRepositoryPort,
  scope: ReaderSummaryProductionScope,
  interestId: string,
): Promise<void> => {
  const existing = await sourceBindings.listByInterest({
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    interestId,
    limit: 100,
  });
  if (existing.nextCursor !== undefined) {
    throw new Error('Production bootstrap interest has more than 100 source bindings');
  }

  const counts = new Map<string, number>();
  for (const binding of existing.sourceBindings) {
    const providerKey = binding.toSnapshot().providerKey;
    counts.set(providerKey, (counts.get(providerKey) ?? 0) + 1);
  }
  const unexpected = [...counts.keys()].filter(
    (providerKey) =>
      !readerSummaryProductionProviderKeys.includes(
        providerKey as ReaderSummaryProductionProviderKey,
      ),
  );
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([providerKey]) => providerKey);
  if (unexpected.length > 0 || duplicates.length > 0) {
    throw new Error(
      `Production bootstrap interest source set is not exact (unexpected=${unexpected.join(',') || 'none'}, duplicates=${duplicates.join(',') || 'none'})`,
    );
  }
};

const ensureProvider = async (
  dependencies: ReaderSummaryProductionSourceBootstrapDependencies,
  scope: ReaderSummaryProductionScope,
  interestId: string,
  providerKey: ReaderSummaryProductionProviderKey,
  capabilityProfileVersion: number,
  config: SourceBindingConfig,
): Promise<
  ReaderSummaryProductionSourceBootstrapResult['providers'][number]
> => {
  const now = dependencies.clock.now();
  const existingBinding =
    await dependencies.sourceBindings.findByInterestAndProvider({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      interestId,
      providerKey,
    });
  const bindingSnapshot = existingBinding?.toSnapshot();
  const sourceBindingId =
    bindingSnapshot?.id ?? sourceBindingIds[providerKey];
  const desiredBinding = SourceBinding.rehydrate({
    id: sourceBindingId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    interestId,
    providerKey,
    capabilityProfileVersion,
    config,
    status: 'enabled',
    createdAt: bindingSnapshot?.createdAt ?? now,
  });
  const sourceBindingCreated = existingBinding === null;
  if (
    sourceBindingCreated ||
    bindingSnapshot?.status !== 'enabled' ||
    bindingSnapshot.capabilityProfileVersion !== capabilityProfileVersion ||
    !sameJson(bindingSnapshot.config, config)
  ) {
    await dependencies.sourceBindings.save(desiredBinding);
  }

  const cadence = providerScanCadenceProfile(providerKey);
  const existingPolicy =
    await dependencies.scanPolicies.findBySourceBinding({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      sourceBindingId,
    });
  const policySnapshot = existingPolicy?.toSnapshot();
  const scanPolicyCreated = existingPolicy === null;
  const scanPolicyUpdated =
    existingPolicy !== null &&
    !existingPolicy.hasConfiguration({
      intervalSeconds: cadence.defaultIntervalSeconds,
      freshnessSeconds: cadence.defaultFreshnessSeconds,
      retryBudget: cadence.defaultRetryBudget,
    });
  const desiredPolicy = ScanPolicy.create({
    id: policySnapshot?.id ?? scanPolicyIds[providerKey],
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    sourceBindingId,
    intervalSeconds: cadence.defaultIntervalSeconds,
    freshnessSeconds: cadence.defaultFreshnessSeconds,
    retryBudget: cadence.defaultRetryBudget,
    nextRunAt:
      policySnapshot === undefined || scanPolicyUpdated
        ? now
        : policySnapshot.nextRunAt,
    createdAt: policySnapshot?.createdAt ?? now,
  });
  if (scanPolicyCreated || scanPolicyUpdated) {
    await dependencies.scanPolicies.save(desiredPolicy);
  }

  return {
    providerKey,
    sourceBindingId,
    scanPolicyId: desiredPolicy.toSnapshot().id,
    sourceBindingCreated,
    scanPolicyCreated,
    scanPolicyUpdated,
  };
};

const verifyBootstrapState = async (
  dependencies: ReaderSummaryProductionSourceBootstrapDependencies,
  scope: ReaderSummaryProductionScope,
  interestId: string,
): Promise<void> => {
  const bindings = await dependencies.sourceBindings.listByInterest({
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    interestId,
    limit: 100,
  });
  const providerKeys = bindings.sourceBindings
    .map((binding) => binding.toSnapshot())
    .filter((binding) => binding.status === 'enabled')
    .map((binding) => binding.providerKey)
    .sort();
  if (
    bindings.nextCursor !== undefined ||
    providerKeys.length !== readerSummaryProductionProviderKeys.length ||
    providerKeys.some(
      (providerKey, index) =>
        providerKey !== [...readerSummaryProductionProviderKeys].sort()[index],
    )
  ) {
    throw new Error('Production bootstrap did not create the exact enabled source set');
  }

  for (const binding of bindings.sourceBindings) {
    const policy = await dependencies.scanPolicies.findBySourceBinding({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      sourceBindingId: binding.toSnapshot().id,
    });
    if (policy === null) {
      throw new Error(
        `Production scan policy is missing for ${binding.toSnapshot().providerKey}`,
      );
    }
  }
};

const sameJson = (
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean => stableJson(left) === stableJson(right);

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value) ?? 'undefined';
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
