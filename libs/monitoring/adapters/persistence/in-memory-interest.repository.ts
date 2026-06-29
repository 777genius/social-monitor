import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { Interest } from '../../domain';
import type { ArchiveInterestParams, ListInterestsQuery, ListInterestsResult, InterestRepositoryPort } from '../../ports';
import { encodeOffsetCursor, parseOffsetCursor } from './offset-pagination';

export class InMemoryInterestRepository implements InterestRepositoryPort {
  private readonly interests = new Map<string, Interest>();

  async save(interest: Interest): Promise<void> {
    const snapshot = interest.toSnapshot();
    this.interests.set(this.key(snapshot.tenantId, snapshot.workspaceId, snapshot.id), interest);
  }

  async archive(params: ArchiveInterestParams): Promise<void> {
    this.interests.delete(this.key(params.tenantId, params.workspaceId, params.interestId));
  }

  async findByName(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    name: string;
  }): Promise<Interest | null> {
    const normalizedName = params.name.trim().toLowerCase();

    for (const interest of this.interests.values()) {
      const snapshot = interest.toSnapshot();
      if (
        snapshot.tenantId === params.tenantId &&
        snapshot.workspaceId === params.workspaceId &&
        snapshot.name.toLowerCase() === normalizedName
      ) {
        return interest;
      }
    }

    return null;
  }

  async findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    interestId: string;
  }): Promise<Interest | null> {
    return this.interests.get(this.key(params.tenantId, params.workspaceId, params.interestId)) ?? null;
  }

  async list(query: ListInterestsQuery): Promise<ListInterestsResult> {
    const offset = parseOffsetCursor(query.cursor);
    const allInterests = [...this.interests.values()]
      .filter((interest) => {
        const snapshot = interest.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      })
      .sort(compareInterestsByCreation);
    const interests = allInterests.slice(offset, offset + query.limit);
    const nextOffset = offset + interests.length;

    return {
      interests,
      nextCursor: nextOffset < allInterests.length ? encodeOffsetCursor(nextOffset) : undefined,
    };
  }

  private key(tenantId: TenantId, workspaceId: WorkspaceId, interestId: string): string {
    return `${tenantId}:${workspaceId}:${interestId}`;
  }
}

const compareInterestsByCreation = (left: Interest, right: Interest): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const createdDiff = rightSnapshot.createdAt.getTime() - leftSnapshot.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return rightSnapshot.id.localeCompare(leftSnapshot.id);
};
