import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import { sourceProviderKey, type SourceProviderKey } from "./source-provider";

export type SourceBinding = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly providerKey: SourceProviderKey;
};

export const createSourceBinding = (props: SourceBinding): SourceBinding => {
  const interestId = props.interestId.trim();
  const sourceBindingId = props.sourceBindingId.trim();

  if (interestId.length === 0) {
    throw new Error("Source binding interest id must be non-empty");
  }
  if (sourceBindingId.length === 0) {
    throw new Error("Source binding id must be non-empty");
  }

  return {
    ...props,
    interestId,
    sourceBindingId,
    providerKey: sourceProviderKey(props.providerKey),
  };
};
