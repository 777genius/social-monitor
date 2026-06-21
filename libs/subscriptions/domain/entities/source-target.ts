import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type SourceTargetKind =
  | 'subreddit'
  | 'topic'
  | 'search_query'
  | 'repository'
  | 'account'
  | 'url';

export type SourceTargetProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly providerKey: string;
  readonly targetKind: SourceTargetKind;
  readonly targetValue: string;
  readonly normalizedKey: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export class SourceTarget {
  private constructor(private readonly props: SourceTargetProps) {}

  static create(props: SourceTargetProps): SourceTarget {
    return new SourceTarget(this.normalize(props));
  }

  static rehydrate(props: SourceTargetProps): SourceTarget {
    return new SourceTarget(this.normalize(props));
  }

  toSnapshot(): SourceTargetProps {
    return { ...this.props };
  }

  private static normalize(props: SourceTargetProps): SourceTargetProps {
    const providerKey = props.providerKey.trim().toLowerCase();
    const targetValue = props.targetValue.trim();
    const normalizedKey = props.normalizedKey.trim().toLowerCase();

    if (props.id.trim().length === 0) {
      throw new Error('Source target id must be non-empty');
    }

    if (providerKey.length < 2) {
      throw new Error('Source target provider key must contain at least 2 characters');
    }

    if (targetValue.length === 0) {
      throw new Error('Source target value must be non-empty');
    }

    if (normalizedKey.length === 0) {
      throw new Error('Source target normalized key must be non-empty');
    }

    if (props.updatedAt.getTime() < props.createdAt.getTime()) {
      throw new Error('Source target updatedAt must not be before createdAt');
    }

    return {
      ...props,
      providerKey,
      targetValue,
      normalizedKey,
    };
  }
}
