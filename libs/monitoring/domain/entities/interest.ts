import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type InterestProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly query: string;
  readonly createdAt: Date;
};

export class Interest {
  private constructor(private readonly props: InterestProps) {}

  static create(props: InterestProps): Interest {
    if (props.name.trim().length < 2) {
      throw new Error('Interest name must contain at least 2 characters');
    }

    if (props.query.trim().length < 2) {
      throw new Error('Interest query must contain at least 2 characters');
    }

    return new Interest({
      ...props,
      name: props.name.trim(),
      query: props.query.trim(),
    });
  }

  static rehydrate(props: InterestProps): Interest {
    return new Interest({
      ...props,
      name: props.name.trim(),
      query: props.query.trim(),
    });
  }

  updateDetails(props: {
    readonly name: string;
    readonly query: string;
  }): Interest {
    return Interest.create({
      ...this.props,
      name: props.name,
      query: props.query,
    });
  }

  toSnapshot(): InterestProps {
    return { ...this.props };
  }
}
