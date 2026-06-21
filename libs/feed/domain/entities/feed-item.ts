import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type FeedItemProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly bodyPreview: string;
  readonly authorHandle?: string;
  readonly publishedAt: Date;
  readonly observedAt: Date;
};

export class FeedItem {
  private constructor(private readonly props: FeedItemProps) {}

  static publish(props: FeedItemProps): FeedItem {
    this.assertValid(props);

    return new FeedItem(props);
  }

  static rehydrate(props: FeedItemProps): FeedItem {
    this.assertValid(props);

    return new FeedItem(props);
  }

  toSnapshot(): FeedItemProps {
    return { ...this.props };
  }

  private static assertValid(props: FeedItemProps): void {
    if (props.id.trim().length === 0) {
      throw new Error('Feed item id must be non-empty');
    }

    if (props.sourceItemId.trim().length === 0) {
      throw new Error('Source item id must be non-empty');
    }

    if (props.providerKey.trim().length === 0) {
      throw new Error('Feed item provider key must be non-empty');
    }

    if (props.topicId.trim().length === 0) {
      throw new Error('Feed item topic id must be non-empty');
    }

    if (props.canonicalUrl.trim().length === 0) {
      throw new Error('Canonical URL must be non-empty');
    }

    if (props.title.trim().length === 0 && props.bodyPreview.trim().length === 0) {
      throw new Error('Feed item title or body preview must be non-empty');
    }
  }
}
