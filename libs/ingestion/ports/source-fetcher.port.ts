import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type FetchSourceItemsCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly scanJobId: string;
};

export type FetchedSourceItem = {
  readonly externalId: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly body: string;
  readonly authorHandle?: string;
  readonly publishedAt: Date;
};

export interface SourceFetcherPort {
  fetch(command: FetchSourceItemsCommand): Promise<readonly FetchedSourceItem[]>;
}
