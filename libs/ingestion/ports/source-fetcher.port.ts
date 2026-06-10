import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import type { SourceQuery } from './source-provider.port';

export type FetchSourceItemsCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly scanJobId: string;
  readonly providerKey: string;
  readonly sourceQuery: SourceQuery;
  readonly correlationId: string;
};

export type FetchedSourceItem = {
  readonly externalId: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly body: string;
  readonly authorHandle?: string;
  readonly publishedAt: Date;
};

export type FetchSourceItemsResult = {
  readonly items: readonly FetchedSourceItem[];
  readonly nextCursor?: string;
};

export interface SourceFetcherPort {
  fetch(command: FetchSourceItemsCommand): Promise<FetchSourceItemsResult>;
}
