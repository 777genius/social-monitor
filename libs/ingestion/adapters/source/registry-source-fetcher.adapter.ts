import { redactSensitiveText } from '@social-monitor/shared-kernel';

import type {
  FetchSourceItemsCommand,
  FetchSourceItemsResult,
  SourceQuery,
  SourceQueryPlannerPort,
  SourceConfigReaderPort,
  SourceFetcherPort,
  SourceProviderScanContext,
  SourceProviderRegistryPort,
  SourceRuntimeConfig,
} from '../../ports';
import { SourceFetchError } from '../../ports';
import {
  DefaultSourceQueryPlanRuntimeCompiler,
  isSourceQueryPlannerEnabled,
  sourceQueryPlannerIntentFromConfig,
  type SourceQueryPlanRuntimeCompiler,
} from './source-query-plan-runtime-compiler';

export class RegistrySourceFetcherAdapter implements SourceFetcherPort {
  constructor(
    private readonly registry: SourceProviderRegistryPort,
    private readonly sourceConfigs?: SourceConfigReaderPort,
    private readonly sourceQueryPlanner?: SourceQueryPlannerPort,
    private readonly sourceQueryPlanCompiler: SourceQueryPlanRuntimeCompiler =
      new DefaultSourceQueryPlanRuntimeCompiler(),
  ) {}

  async fetch(command: FetchSourceItemsCommand): Promise<FetchSourceItemsResult> {
    const provider = await this.registry.getProvider(command.providerKey);

    if (!provider) {
      throw new Error(`Source provider not registered: ${command.providerKey}`);
    }

    const validation = provider.validateBinding(command.sourceQuery);
    if (!validation.ok) {
      throw new SourceFetchError({
        providerKey: command.providerKey,
        kind: 'invalid_query',
        retryable: false,
        message: validation.reason,
      });
    }

    const initialConfig = await this.readMergedConfig(command);
    const planned = await this.resolveSourceQuery({
      command,
      providerKey: provider.key(),
      config: initialConfig,
    });
    const plannedValidation = provider.validateBinding(planned.sourceQuery);
    if (!plannedValidation.ok) {
      throw new SourceFetchError({
        providerKey: command.providerKey,
        kind: 'invalid_query',
        retryable: false,
        message: plannedValidation.reason,
      });
    }

    const context = this.buildContext(
      command,
      mergeSourceQueryParameters(initialConfig, planned.sourceQuery.parameters),
    );

    try {
      const plan = {
        ...provider.planScan(planned.sourceQuery, context),
        cursor: command.cursor,
      };
      const result = await provider.scan(plan, context);

      return {
        items: result.items,
        conversationUnits: result.conversationUnits,
        nextCursor: result.nextCursor,
        warnings: compactUnique([
          ...planned.warnings,
          ...(result.warnings ?? []),
        ]),
      };
    } catch (error) {
      const failure = provider.classifyError(error, context);

      throw new SourceFetchError({
        providerKey: provider.key(),
        kind: failure.kind,
        retryable: failure.retryable,
        message: failure.message,
        retryAfterMs: failure.retryAfterMs,
        rateLimitResetAt: failure.rateLimitResetAt,
      });
    }
  }

  private async readMergedConfig(
    command: FetchSourceItemsCommand,
  ): Promise<SourceRuntimeConfig | undefined> {
    const config = await this.sourceConfigs?.readConfig({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
    });

    return mergeSourceQueryParameters(config, command.sourceQuery.parameters);
  }

  private async resolveSourceQuery(params: {
    readonly command: FetchSourceItemsCommand;
    readonly providerKey: string;
    readonly config?: SourceRuntimeConfig;
  }): Promise<{
    readonly sourceQuery: SourceQuery;
    readonly warnings: readonly string[];
  }> {
    if (
      this.sourceQueryPlanner === undefined ||
      !isSourceQueryPlannerEnabled(params.config)
    ) {
      return { sourceQuery: params.command.sourceQuery, warnings: [] };
    }

    try {
      const plan = await this.sourceQueryPlanner.compilePlan({
        intent: sourceQueryPlannerIntentFromConfig({
          providerKey: params.providerKey,
          sourceQuery: params.command.sourceQuery,
          config: params.config,
        }),
      });
      const compiled = this.sourceQueryPlanCompiler.compile({
        providerKey: params.providerKey,
        originalSourceQuery: params.command.sourceQuery,
        runtimeConfig: params.config,
        plan,
      });

      return {
        sourceQuery: compiled.sourceQuery,
        warnings: [...plan.warnings, ...compiled.warnings],
      };
    } catch (error) {
      const message = redactSensitiveText(
        error instanceof Error ? error.message : 'Unknown planner error',
      );

      return {
        sourceQuery: params.command.sourceQuery,
        warnings: [`source_query_planner.degraded:${message}`],
      };
    }
  }

  private buildContext(
    command: FetchSourceItemsCommand,
    config: SourceRuntimeConfig | undefined,
  ): SourceProviderScanContext {
    const baseContext = {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
      scanJobId: command.scanJobId,
      correlationId: command.correlationId,
    };

    return config === undefined
      ? baseContext
      : { ...baseContext, config };
  }
}

const mergeSourceQueryParameters = (
  config: SourceRuntimeConfig | null | undefined,
  parameters: SourceRuntimeConfig | undefined,
): SourceRuntimeConfig | undefined => {
  if (config === undefined || config === null) {
    return parameters;
  }

  if (parameters === undefined) {
    return config;
  }

  return {
    ...config,
    ...parameters,
  };
};

const compactUnique = (values: readonly string[]): readonly string[] => [
  ...new Set(values),
];
