import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type DigestProvenanceItem = {
  readonly resourceType: 'summary' | 'feed_item';
  readonly resourceId: string;
  readonly interestId: string;
  readonly includedReason: 'within_window' | 'high_signal' | 'user_selected_topic';
};

export type DigestWindow = {
  readonly windowId: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
};

export type DigestProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly recipientKey: string;
  readonly channel: 'in_app' | 'email' | 'webhook';
  readonly window: DigestWindow;
  readonly status: 'assembled' | 'empty';
  readonly summaryIds: readonly string[];
  readonly feedItemIds: readonly string[];
  readonly provenance: readonly DigestProvenanceItem[];
  readonly contentHash: string;
  readonly assembledAt: Date;
};

export class Digest {
  private constructor(private readonly props: DigestProps) {}

  static assemble(props: DigestProps): Digest {
    return this.rehydrate(props);
  }

  static rehydrate(props: DigestProps): Digest {
    if (props.id.trim().length === 0) {
      throw new Error('Digest id must be non-empty');
    }

    if (props.recipientKey.trim().length === 0) {
      throw new Error('Digest recipient key must be non-empty');
    }

    if (props.window.endedAt.getTime() <= props.window.startedAt.getTime()) {
      throw new Error('Digest window end must be after start');
    }

    if (props.window.windowId.trim().length === 0) {
      throw new Error('Digest window id must be non-empty');
    }

    if (props.contentHash.trim().length === 0) {
      throw new Error('Digest content hash must be non-empty');
    }

    if (props.status === 'assembled' && props.provenance.length === 0) {
      throw new Error('Assembled digest must include provenance');
    }

    return new Digest({
      ...props,
      recipientKey: props.recipientKey.trim(),
      summaryIds: uniqueSorted(props.summaryIds),
      feedItemIds: uniqueSorted(props.feedItemIds),
      provenance: [...props.provenance].sort(compareProvenance),
      contentHash: props.contentHash.trim(),
    });
  }

  toSnapshot(): DigestProps {
    return { ...this.props };
  }
}

const uniqueSorted = (values: readonly string[]): string[] =>
  [...new Set(values.map((value) => value.trim()))].filter((value) => value.length > 0)
    .sort((left, right) => left.localeCompare(right));

const compareProvenance = (left: DigestProvenanceItem, right: DigestProvenanceItem): number => {
  const typeDiff = left.resourceType.localeCompare(right.resourceType);

  if (typeDiff !== 0) {
    return typeDiff;
  }

  return left.resourceId.localeCompare(right.resourceId);
};
