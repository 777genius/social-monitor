import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import type { SourceItem } from '../domain/entities/source-item';
import type { ArticleCaptureAttempt } from '../domain/value-objects/article-capture-attempt';
import type { ScanLease } from './scan-lease.port';

export type ArticleCaptureScope = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly providerKey: string;
};
export type ReserveArticleCaptureCommand = ArticleCaptureScope & {
  readonly externalId: string;
  readonly expectedNativeRevision: string;
  readonly expectedArticleUrl: string;
  readonly reservationToken: string;
  readonly lease: ScanLease;
  readonly now: Date;
};
export type CompleteArticleCaptureCommand = ArticleCaptureScope & {
  readonly item: SourceItem;
  readonly expected: ArticleCaptureAttempt;
  readonly lease: ScanLease;
  readonly now: Date;
};
export interface ArticleCaptureRepository {
  findDueArticleCaptures(command: ArticleCaptureScope & { readonly now: Date; readonly limit: number }): Promise<readonly SourceItem[]>;
  reserveArticleCapture(command: ReserveArticleCaptureCommand): Promise<SourceItem | null>;
  completeArticleCapture(command: CompleteArticleCaptureCommand): Promise<SourceItem | null>;
}
