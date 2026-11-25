import type { JsonObject, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type SourceItemProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly externalId: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly body: string;
  readonly authorHandle?: string;
  readonly publishedAt: Date;
  readonly ingestedAt: Date;
  readonly metadata?: JsonObject;
};

export class SourceItem {
  private constructor(private readonly props: SourceItemProps) {}

  static ingest(props: SourceItemProps): SourceItem {
    this.assertValid(props);

    return new SourceItem(props);
  }

  static rehydrate(props: SourceItemProps): SourceItem {
    this.assertValid(props);

    return new SourceItem(props);
  }

  toSnapshot(): SourceItemProps {
    return { ...this.props };
  }

  private static assertValid(props: SourceItemProps): void {
    if (props.sourceBindingId.trim().length === 0) {
      throw new Error('Source binding id must be non-empty');
    }

    if (props.externalId.trim().length === 0) {
      throw new Error('External id must be non-empty');
    }

    if (props.canonicalUrl.trim().length === 0) {
      throw new Error('Canonical URL must be non-empty');
    }

    if (props.title.trim().length === 0 && props.body.trim().length === 0) {
      throw new Error('Source item title or body must be non-empty');
    }
  }
}
