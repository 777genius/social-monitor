import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type {
  SourceBindingRepositoryPort,
  SourceCatalogPort,
  InterestRepositoryPort,
} from '../../ports';
import {
  providerScanCadenceProfile,
} from '../shared/scan-cadence-policy';
import { presentInterest } from '../shared/interest-presenter';
import type { PlanInterestCoverageCommand } from './plan-interest-coverage.command';
import type {
  PlanInterestCoverageResult,
  InterestCoveragePlanDraft,
} from './plan-interest-coverage.result';
import {
  providerPlanners,
  sourcePlannerHints,
  type ProviderDraftPlan,
  type ProviderPlanner,
} from './interest-coverage-provider-draft-planners';

type PlanInterestCoverageFailure = DomainError;

const providerPlannerByKey = new Map(
  providerPlanners.map((planner) => [planner.providerKey, planner]),
);

export class PlanInterestCoverageUseCase {
  constructor(
    private readonly interests: InterestRepositoryPort,
    private readonly sourceBindings: SourceBindingRepositoryPort,
    private readonly sourceCatalog: SourceCatalogPort,
  ) {}

  async execute(
    command: PlanInterestCoverageCommand,
  ): Promise<Result<PlanInterestCoverageResult, PlanInterestCoverageFailure>> {
    if (command.interestId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Interest id is required'));
    }

    const interest = await this.interests.findById({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      interestId: command.interestId,
    });
    if (interest === null) {
      return err(new DomainError('resource.not_found', 'Interest not found', { interestId: command.interestId }));
    }

    const interestSnapshot = interest.toSnapshot();
    const normalizedKeywords = normalizeKeywords([
      ...(command.keywords ?? []),
      interestSnapshot.query,
      interestSnapshot.name,
      ...(command.description === undefined ? [] : [command.description]),
    ]);
    const planningQuery = buildPlanningQuery(normalizedKeywords);
    if (planningQuery.length === 0) {
      return err(new DomainError('validation.failed', 'Coverage planning requires an interest query or keyword hint'));
    }

    const providerSelection = selectProviders(command);
    if (providerSelection instanceof DomainError) {
      return err(providerSelection);
    }

    const existingBindings = await this.sourceBindings.listByInterest({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      interestId: command.interestId,
      limit: 100,
    });
    const existingBindingByProvider = new Map(
      existingBindings.sourceBindings.map((binding) => {
        const snapshot = binding.toSnapshot();

        return [snapshot.providerKey, snapshot];
      }),
    );
    const hints = sourcePlannerHints(command);
    const drafts: InterestCoveragePlanDraft[] = [];
    const skippedProviders = [...providerSelection.skippedProviders];

    for (const planner of providerSelection.planners) {
      const capability = await this.sourceCatalog.getCapability(planner.providerKey);
      if (capability === null || !capability.productionSafe) {
        skippedProviders.push({
          providerKey: planner.providerKey,
          reason: 'Source provider is not available for production-safe scans.',
        });
        continue;
      }

      const existingSourceBinding = existingBindingByProvider.get(planner.providerKey);
      const draft = planner.build({
        planningQuery,
        hints,
        ...(existingSourceBinding === undefined ? {} : { existingSourceBinding }),
      });
      const validatedDraft = await this.validateDraft(planner.providerKey, draft);
      const cadence = providerScanCadenceProfile(planner.providerKey);

      drafts.push({
        ...validatedDraft,
        ...(existingSourceBinding === undefined ? {} : { existingSourceBindingId: existingSourceBinding.id }),
        ...(validatedDraft.status === 'ready' && existingSourceBinding === undefined
          ? {
              applyTarget: {
                method: 'POST',
                path: `/interests/${command.interestId}/source-bindings`,
                requiredScope: 'write:source_bindings',
              },
            }
          : {}),
        cadenceSuggestion: {
          intervalSeconds: cadence.defaultIntervalSeconds,
          freshnessSeconds: cadence.defaultFreshnessSeconds,
          retryBudget: cadence.defaultRetryBudget,
        },
      });
    }

    return ok({
      interest: presentInterest(interest),
      planningQuery,
      normalizedKeywords,
      drafts: drafts.sort((left, right) => left.priority - right.priority),
      coverageGaps: coverageGaps(drafts),
      skippedProviders,
    });
  }

  private async validateDraft(
    providerKey: string,
    draft: ProviderDraftPlan,
  ): Promise<ProviderDraftPlan> {
    const config = draft.sourceBindingDraft?.config;
    if (config === undefined || draft.status !== 'ready') {
      return draft;
    }

    const validation = await this.sourceCatalog.validateBindingConfig(providerKey, config);
    if (validation.ok) {
      return draft;
    }

    return {
      ...draft,
      status: 'unsupported',
      warnings: [
        ...draft.warnings,
        `Generated source config failed provider validation: ${validation.reason}`,
      ],
      sourceBindingDraft: undefined,
    };
  }
}

const selectProviders = (
  command: PlanInterestCoverageCommand,
):
  | {
      readonly planners: readonly ProviderPlanner[];
      readonly skippedProviders: readonly { readonly providerKey: string; readonly reason: string }[];
    }
  | DomainError => {
  const includeProviders = normalizeProviderFilter(command.includeProviders);
  const excludeProviders = normalizeProviderFilter(command.excludeProviders);
  const skippedProviders: { providerKey: string; reason: string }[] = [];

  if (includeProviders instanceof DomainError) {
    return includeProviders;
  }
  if (excludeProviders instanceof DomainError) {
    return excludeProviders;
  }

  const requestedProviderKeys =
    includeProviders === undefined
      ? providerPlanners.map((planner) => planner.providerKey)
      : includeProviders;
  const planners = requestedProviderKeys.flatMap((providerKey) => {
    const planner = providerPlannerByKey.get(providerKey);
    if (planner === undefined) {
      skippedProviders.push({
        providerKey,
        reason: 'No coverage planner exists for this provider yet.',
      });
      return [];
    }

    return excludeProviders?.includes(providerKey) === true ? [] : [planner];
  });

  if (planners.length === 0) {
    return new DomainError('validation.failed', 'Coverage planning provider selection is empty');
  }

  return { planners, skippedProviders };
};

const normalizeProviderFilter = (
  providers: readonly string[] | undefined,
): readonly string[] | undefined | DomainError => {
  if (providers === undefined) {
    return undefined;
  }

  const normalized = uniqueSorted(providers.map((provider) => provider.trim()).filter(Boolean));
  if (providers.length > 0 && normalized.length === 0) {
    return new DomainError('validation.failed', 'Coverage planning provider filter must not be empty');
  }

  return normalized.length === 0 ? undefined : normalized;
};

const normalizeKeywords = (values: readonly string[]): readonly string[] => {
  const phrases = values
    .flatMap(splitKeywordHints)
    .map((value) => normalizeKeyword(value))
    .filter((value): value is string => value !== undefined);

  return uniqueSorted(phrases).slice(0, 8);
};

const splitKeywordHints = (value: string): readonly string[] =>
  value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeKeyword = (value: string): string | undefined => {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (normalized.length < 2) {
    return undefined;
  }

  return normalized.slice(0, 80);
};

const buildPlanningQuery = (keywords: readonly string[]): string =>
  keywords.map(searchTerm).join(' OR ').slice(0, 500);

const searchTerm = (keyword: string): string =>
  /\s/.test(keyword) ? `"${keyword.replace(/"/g, '')}"` : keyword;

const coverageGaps = (drafts: readonly InterestCoveragePlanDraft[]): readonly string[] => {
  const gaps = new Set<string>();

  for (const draft of drafts) {
    for (const warning of draft.warnings) {
      if (warning.toLowerCase().includes('runtime gap')) {
        gaps.add(warning);
      }
      if (warning.toLowerCase().includes('not implemented yet')) {
        gaps.add(warning);
      }
    }
  }

  return [...gaps].sort();
};

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en-US'));
