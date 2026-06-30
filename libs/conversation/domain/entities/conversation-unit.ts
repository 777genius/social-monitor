import type { JsonObject, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ConversationUnitRole = 'top_level_comment' | 'reply';

export type ConversationUnitProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly rootFeedItemId: string;
  readonly rootProviderItemId: string;
  readonly providerKey: string;
  readonly providerUnitId: string;
  readonly canonicalUrl: string;
  readonly authorHandle?: string;
  readonly body: string;
  readonly publishedAt: Date;
  readonly observedAt: Date;
  readonly threadExternalId: string;
  readonly parentProviderUnitId?: string;
  readonly depth: number;
  readonly role: ConversationUnitRole;
  readonly providerMetadata?: JsonObject;
  readonly contentHash: string;
  readonly schemaVersion: number;
};

export class ConversationUnit {
  private constructor(private readonly props: ConversationUnitProps) {}

  static capture(props: ConversationUnitProps): ConversationUnit {
    this.assertValid(props);

    return new ConversationUnit(props);
  }

  static rehydrate(props: ConversationUnitProps): ConversationUnit {
    this.assertValid(props);

    return new ConversationUnit(props);
  }

  toSnapshot(): ConversationUnitProps {
    return { ...this.props };
  }

  private static assertValid(props: ConversationUnitProps): void {
    if (props.id.trim().length === 0) {
      throw new Error('Conversation unit id must be non-empty');
    }
    if (props.interestId.trim().length === 0) {
      throw new Error('Conversation unit interest id must be non-empty');
    }
    if (props.sourceBindingId.trim().length === 0) {
      throw new Error('Conversation unit source binding id must be non-empty');
    }
    if (props.rootFeedItemId.trim().length === 0) {
      throw new Error('Conversation unit root feed item id must be non-empty');
    }
    if (props.rootProviderItemId.trim().length === 0) {
      throw new Error('Conversation unit root provider item id must be non-empty');
    }
    if (props.providerKey.trim().length === 0) {
      throw new Error('Conversation unit provider key must be non-empty');
    }
    if (props.providerUnitId.trim().length === 0) {
      throw new Error('Conversation unit provider unit id must be non-empty');
    }
    if (props.canonicalUrl.trim().length === 0) {
      throw new Error('Conversation unit canonical URL must be non-empty');
    }
    if (props.body.trim().length === 0) {
      throw new Error('Conversation unit body must be non-empty');
    }
    if (props.threadExternalId.trim().length === 0) {
      throw new Error('Conversation unit thread external id must be non-empty');
    }
    if (!Number.isInteger(props.depth) || props.depth < 0) {
      throw new Error('Conversation unit depth must be a non-negative integer');
    }
    if (props.role !== 'top_level_comment' && props.role !== 'reply') {
      throw new Error('Conversation unit role is unsupported');
    }
    if (!Number.isInteger(props.schemaVersion) || props.schemaVersion <= 0) {
      throw new Error('Conversation unit schema version must be positive');
    }
  }
}
