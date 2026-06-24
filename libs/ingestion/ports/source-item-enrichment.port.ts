import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { FetchedSourceItem } from './source-fetcher.port';

export type EnrichSourceItemsCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly scanJobId: string;
  readonly providerKey: string;
  readonly correlationId: string;
  readonly items: readonly FetchedSourceItem[];
};

export type EnrichSourceItemsResult = {
  readonly items: readonly FetchedSourceItem[];
  readonly enriched: number;
  readonly skipped: number;
  readonly failed: number;
};

export interface SourceItemEnrichmentPort {
  enrich(command: EnrichSourceItemsCommand): Promise<EnrichSourceItemsResult>;
}

export const noopSourceItemEnrichment: SourceItemEnrichmentPort = {
  async enrich(command) {
    return {
      items: command.items,
      enriched: 0,
      skipped: command.items.length,
      failed: 0,
    };
  },
};
