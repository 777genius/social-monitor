import type { JsonObject, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import type {
  FetchedConversationUnit,
  ProviderFailureKind,
  SourceQuery,
} from './source-provider.port';

export type FetchSourceItemsCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly scanJobId: string;
  readonly providerKey: string;
  readonly sourceQuery: SourceQuery;
  readonly correlationId: string;
  readonly cursor?: string;
};

export type FetchedSourceItem = {
  readonly externalId: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly body: string;
  readonly authorHandle?: string;
  readonly publishedAt: Date;
  readonly metadata?: JsonObject;
};

export type FetchSourceItemsResult = {
  readonly items: readonly FetchedSourceItem[];
  readonly conversationUnits?: readonly FetchedConversationUnit[];
  readonly nextCursor?: string;
  readonly warnings?: readonly string[];
};

export class SourceFetchError extends Error {
  override readonly name = 'SourceFetchError';
  readonly providerKey: string;
  readonly kind: ProviderFailureKind;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly rateLimitResetAt?: Date;

  constructor(params: {
    readonly providerKey: string;
    readonly kind: ProviderFailureKind;
    readonly retryable: boolean;
    readonly message: string;
    readonly retryAfterMs?: number;
    readonly rateLimitResetAt?: Date;
  }) {
    super(params.message);
    this.providerKey = params.providerKey;
    this.kind = params.kind;
    this.retryable = params.retryable;
    this.retryAfterMs = params.retryAfterMs;
    this.rateLimitResetAt = params.rateLimitResetAt;
  }
}

export interface SourceFetcherPort {
  fetch(command: FetchSourceItemsCommand): Promise<FetchSourceItemsResult>;
}
