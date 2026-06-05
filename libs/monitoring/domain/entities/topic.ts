import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type TopicProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly query: string;
  readonly createdAt: Date;
};

export class Topic {
  private constructor(private readonly props: TopicProps) {}

  static create(props: TopicProps): Topic {
    if (props.name.trim().length < 2) {
      throw new Error('Topic name must contain at least 2 characters');
    }

    if (props.query.trim().length < 2) {
      throw new Error('Topic query must contain at least 2 characters');
    }

    return new Topic({
      ...props,
      name: props.name.trim(),
      query: props.query.trim(),
    });
  }

  toSnapshot(): TopicProps {
    return { ...this.props };
  }
}
