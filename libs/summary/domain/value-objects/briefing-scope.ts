import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type BriefingScope =
  | { readonly type: 'workspace' }
  | { readonly type: 'topic'; readonly topicId: string };

export type BriefingScopeIdentity = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: BriefingScope;
};

export const workspaceBriefingScope = (): BriefingScope => ({ type: 'workspace' });

export const topicBriefingScope = (topicId: string): BriefingScope => {
  const normalizedTopicId = topicId.trim();
  if (normalizedTopicId.length === 0) {
    throw new Error('Briefing topic scope topic id must be non-empty');
  }

  return { type: 'topic', topicId: normalizedTopicId };
};

export const assertBriefingScope = (scope: BriefingScope): void => {
  if (scope.type === 'workspace') {
    return;
  }

  if (scope.topicId.trim().length === 0) {
    throw new Error('Briefing topic scope topic id must be non-empty');
  }
};

export const briefingScopeKey = (scope: BriefingScope): string =>
  scope.type === 'workspace' ? 'workspace' : `topic:${scope.topicId}`;

export const sameBriefingScope = (left: BriefingScope, right: BriefingScope): boolean =>
  briefingScopeKey(left) === briefingScopeKey(right);
