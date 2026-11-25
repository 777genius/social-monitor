import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type SourceRuntimeConfigValue =
  | string
  | number
  | boolean
  | null
  | readonly SourceRuntimeConfigValue[]
  | { readonly [key: string]: SourceRuntimeConfigValue };

export type SourceRuntimeConfig = Readonly<Record<string, SourceRuntimeConfigValue>>;

export interface SourceConfigReaderPort {
  readConfig(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly sourceBindingId: string;
  }): Promise<SourceRuntimeConfig | null>;
}
