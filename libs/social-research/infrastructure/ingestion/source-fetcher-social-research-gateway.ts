import type {
  FetchedConversationUnit,
  FetchedSourceItem,
  SourceFetcherPort,
} from '@social-monitor/ingestion/ports';
import { SourceFetchError } from '@social-monitor/ingestion/ports';

import type {
  ExecuteSocialSearchPlanCommand,
  FetchSocialThreadCommand,
  SocialResearchExecutionScope,
  SocialResearchGateway,
  SocialSearchRun,
  SocialThread,
  SocialThreadReaderPort,
} from '../../application/contracts/social-research-gateway';
import type { SocialSearchItem } from '../../domain/entities/social-search-item';
import { rankSocialItems } from '../../domain/policies/social-item-ranker';
import {
  DefaultSourceFetcherLaneExecutionCompiler,
  type SourceFetcherLaneExecution,
  type SourceFetcherLaneExecutionCompiler,
} from './source-fetcher-lane-execution-compiler';
import { socialItemFromFetchedSourceItem } from './source-fetcher-social-research-mappers';

export type SourceFetcherSocialResearchGatewayOptions = {
  readonly executionScope?: SocialResearchExecutionScope;
  readonly continueOnLaneFailure?: boolean;
  readonly threadReader?: SocialThreadReaderPort;
  readonly laneExecutionCompiler?: SourceFetcherLaneExecutionCompiler;
};

export class SourceFetcherSocialResearchGatewayError extends Error {
  override readonly name = 'SourceFetcherSocialResearchGatewayError';

  constructor(
    readonly code:
      | 'execution_scope_required'
      | 'source_binding_missing'
      | 'thread_fetch_not_configured',
    message: string,
  ) {
    super(message);
  }
}

export class SourceFetcherSocialResearchGateway implements SocialResearchGateway {
  constructor(
    private readonly sourceFetcher: SourceFetcherPort,
    private readonly options: SourceFetcherSocialResearchGatewayOptions = {},
  ) {}

  async executeSearchPlan(
    command: ExecuteSocialSearchPlanCommand,
  ): Promise<SocialSearchRun> {
    const execution = command.execution ?? this.options.executionScope;
    if (execution === undefined) {
      throw new SourceFetcherSocialResearchGatewayError(
        'execution_scope_required',
        'Social research execution scope is required.',
      );
    }

    const itemsById = new Map<string, SocialSearchItem>();
    const warnings: string[] = command.plan.warnings.map(
      (warning) => `${warning.code}: ${warning.message}`,
    );
    const laneExecutionPlan = (
      this.options.laneExecutionCompiler ?? defaultLaneExecutionCompiler
    ).compile(command.plan.lanes);
    warnings.push(
      ...laneExecutionPlan.skippedLanes.map(
        (skipped) => `${skipped.lane.laneId}: ${skipped.reason}`,
      ),
    );
    let partial = false;

    for (const laneExecution of laneExecutionPlan.executions) {
      const sourceBindingId =
        execution.sourceBindingIdBySource[laneExecution.sourceKey];
      if (sourceBindingId === undefined) {
        partial = true;
        warnings.push(`${laneExecution.executionId}: source binding is missing`);
        if (this.options.continueOnLaneFailure === false) {
          throw new SourceFetcherSocialResearchGatewayError(
            'source_binding_missing',
            `Source binding is missing for ${laneExecution.sourceKey}.`,
          );
        }
        continue;
      }

      try {
        const fetched = await this.sourceFetcher.fetch({
          tenantId: execution.tenantId,
          workspaceId: execution.workspaceId,
          sourceBindingId,
          scanJobId: scanJobIdForExecution(execution.scanJobId, laneExecution),
          providerKey: laneExecution.sourceKey,
          sourceQuery: laneExecution.sourceQuery,
          correlationId:
            command.correlationId ??
            execution.correlationId ??
            execution.scanJobId,
          cursor: cursorForExecution(execution.cursorByLaneId, laneExecution),
        });

        for (const item of fetched.items) {
          mergeItem(itemsById, normalizeFetchedItem(item, laneExecution));
        }

        warnings.push(
          ...conversationWarnings(fetched.conversationUnits, laneExecution),
        );
      } catch (error) {
        partial = true;
        warnings.push(formatLaneFailure(error, laneExecution));
        if (this.options.continueOnLaneFailure === false) {
          throw error;
        }
      }
    }

    const items = [...itemsById.values()];

    return {
      plan: command.plan,
      items,
      rankedItems: rankSocialItems({
        intent: command.plan.intent,
        items,
      }),
      warnings,
      partial,
    };
  }

  async fetchThread(
    command: FetchSocialThreadCommand,
  ): Promise<SocialThread> {
    if (this.options.threadReader === undefined) {
      throw new SourceFetcherSocialResearchGatewayError(
        'thread_fetch_not_configured',
        'Thread fetch needs a dedicated thread reader before it can execute.',
      );
    }

    const execution = command.execution ?? this.options.executionScope;
    if (execution === undefined) {
      throw new SourceFetcherSocialResearchGatewayError(
        'execution_scope_required',
        'Social research execution scope is required.',
      );
    }

    return this.options.threadReader.fetchThread({
      ...command,
      execution,
    });
  }
}

const defaultLaneExecutionCompiler = new DefaultSourceFetcherLaneExecutionCompiler();

const normalizeFetchedItem = (
  item: FetchedSourceItem,
  laneExecution: SourceFetcherLaneExecution,
): SocialSearchItem =>
  socialItemFromFetchedSourceItem(item, {
    sourceKey: laneExecution.sourceKey,
    evidence: [
      ...laneExecution.lanes.map((lane) => `lane:${lane.laneId}`),
      ...laneExecution.lanes.map((lane) => `reason:${lane.reason}`),
      `query:${laneExecution.sourceQuery.query}`,
    ],
  });

const mergeItem = (
  itemsById: Map<string, SocialSearchItem>,
  item: SocialSearchItem,
): void => {
  const key = item.itemId.length > 0 ? item.itemId : item.canonicalUrl;
  const existing = itemsById.get(key);

  if (existing === undefined) {
    itemsById.set(key, item);
    return;
  }

  itemsById.set(key, {
    ...existing,
    evidence: [...(existing.evidence ?? []), ...(item.evidence ?? [])],
  });
};

const conversationWarnings = (
  units: readonly FetchedConversationUnit[] | undefined,
  laneExecution: SourceFetcherLaneExecution,
): readonly string[] =>
  units === undefined || units.length === 0
    ? []
    : [
        `${laneExecution.executionId}: ${units.length} conversation units fetched`,
      ];

const formatLaneFailure = (
  error: unknown,
  laneExecution: SourceFetcherLaneExecution,
): string => {
  if (error instanceof SourceFetchError) {
    return `${laneExecution.executionId}: provider=${error.providerKey} kind=${error.kind} retryable=${error.retryable} message=${error.message}`;
  }

  return `${laneExecution.executionId}: ${error instanceof Error ? error.message : 'unknown lane failure'}`;
};

const scanJobIdForExecution = (
  scanJobId: string,
  laneExecution: SourceFetcherLaneExecution,
): string =>
  `${scanJobId}:${laneExecution.executionId
    .replace(/[^a-zA-Z0-9:_-]/g, '_')
    .slice(0, 80)}`;

const cursorForExecution = (
  cursorByLaneId: SocialResearchExecutionScope['cursorByLaneId'],
  laneExecution: SourceFetcherLaneExecution,
): string | undefined =>
  laneExecution.cursorLaneId === undefined
    ? undefined
    : cursorByLaneId?.[laneExecution.cursorLaneId];
