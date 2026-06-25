import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import { sourceProviderKey, type SourceProviderKey } from "./source-provider";

export type SourceBinding = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly sourceBindingId: string;
  readonly providerKey: SourceProviderKey;
};

export const createSourceBinding = (props: SourceBinding): SourceBinding => {
  const topicId = props.topicId.trim();
  const sourceBindingId = props.sourceBindingId.trim();

  if (topicId.length === 0) {
    throw new Error("Source binding topic id must be non-empty");
  }
  if (sourceBindingId.length === 0) {
    throw new Error("Source binding id must be non-empty");
  }

  return {
    ...props,
    topicId,
    sourceBindingId,
    providerKey: sourceProviderKey(props.providerKey),
  };
};
