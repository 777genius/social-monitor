import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type SourceBindingStatus = 'enabled' | 'paused';

export type SourceBindingProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly providerKey: string;
  readonly capabilityProfileVersion: number;
  readonly config: Readonly<Record<string, unknown>>;
  readonly status: SourceBindingStatus;
  readonly createdAt: Date;
};

export class SourceBinding {
  private constructor(private readonly props: SourceBindingProps) {}

  static create(props: Omit<SourceBindingProps, 'status'>): SourceBinding {
    if (props.providerKey.trim().length === 0) {
      throw new Error('Source provider key must be non-empty');
    }

    if (props.capabilityProfileVersion < 1) {
      throw new Error('Capability profile version must be positive');
    }

    return new SourceBinding({
      ...props,
      providerKey: props.providerKey.trim(),
      status: 'enabled',
    });
  }

  pause(): SourceBinding {
    return new SourceBinding({
      ...this.props,
      status: 'paused',
    });
  }

  resume(): SourceBinding {
    return new SourceBinding({
      ...this.props,
      status: 'enabled',
    });
  }

  toSnapshot(): SourceBindingProps {
    return { ...this.props };
  }
}
