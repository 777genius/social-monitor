import type {
  FetchSourceItemsCommand,
  FetchedSourceItem,
  SourceFetcherPort,
} from '@social-monitor/ingestion/ports';

import type {
  FetchSocialThreadReaderCommand,
  SocialThread,
  SocialThreadReaderPort,
} from '../../application/contracts/social-research-gateway';
import {
  socialItemFromFetchedSourceItem,
  socialThreadUnitsFromConversationUnits,
} from './source-fetcher-social-research-mappers';

export class SourceFetcherSocialThreadReaderError extends Error {
  override readonly name = 'SourceFetcherSocialThreadReaderError';

  constructor(
    readonly code:
      | 'source_key_required'
      | 'source_binding_missing'
      | 'thread_identifier_required'
      | 'thread_not_found',
    message: string,
  ) {
    super(message);
  }
}

export class SourceFetcherSocialThreadReader implements SocialThreadReaderPort {
  constructor(private readonly sourceFetcher: SourceFetcherPort) {}

  async fetchThread(command: FetchSocialThreadReaderCommand): Promise<SocialThread> {
    const sourceKey = nonEmpty(command.sourceKey);
    if (sourceKey === undefined) {
      throw new SourceFetcherSocialThreadReaderError(
        'source_key_required',
        'Thread fetch requires sourceKey for source-bound execution.',
      );
    }

    const identifier = nonEmpty(command.externalId) ?? nonEmpty(command.canonicalUrl);
    if (identifier === undefined) {
      throw new SourceFetcherSocialThreadReaderError(
        'thread_identifier_required',
        'Thread fetch requires canonicalUrl or externalId.',
      );
    }

    const sourceBindingId = command.execution.sourceBindingIdBySource[sourceKey];
    if (sourceBindingId === undefined) {
      throw new SourceFetcherSocialThreadReaderError(
        'source_binding_missing',
        `Source binding is missing for ${sourceKey}.`,
      );
    }

    const fetched = await this.sourceFetcher.fetch(
      fetchCommandForThread(command, sourceKey, sourceBindingId, identifier),
    );
    const root = selectRootItem(fetched.items, command);
    if (root === undefined) {
      throw new SourceFetcherSocialThreadReaderError(
        'thread_not_found',
        `Thread root was not found for ${identifier}.`,
      );
    }

    const units = socialThreadUnitsFromConversationUnits(
      fetched.conversationUnits,
      command.maxDepth,
    );

    return {
      root: socialItemFromFetchedSourceItem(root, {
        sourceKey,
        evidence: ['thread_fetch', `query:${identifier}`],
      }),
      units,
      warnings:
        units.length === 0
          ? ['Thread root fetched without conversation units.']
          : [],
    };
  }
}

const fetchCommandForThread = (
  command: FetchSocialThreadReaderCommand,
  sourceKey: string,
  sourceBindingId: string,
  identifier: string,
): FetchSourceItemsCommand => ({
  tenantId: command.execution.tenantId,
  workspaceId: command.execution.workspaceId,
  sourceBindingId,
  scanJobId: `${command.execution.scanJobId}:thread:${safeId(identifier)}`,
  providerKey: sourceKey,
  sourceQuery: {
    mode: 'search',
    query: identifier,
  },
  correlationId: command.execution.correlationId ?? command.execution.scanJobId,
});

const selectRootItem = (
  items: readonly FetchedSourceItem[],
  command: FetchSocialThreadReaderCommand,
): FetchedSourceItem | undefined =>
  items.find((item) => item.externalId === command.externalId) ??
  items.find((item) => item.canonicalUrl === command.canonicalUrl) ??
  items[0];

const nonEmpty = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const safeId = (value: string): string =>
  value.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 80);
