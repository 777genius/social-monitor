import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { Interest } from '../../domain';
import type { ArchiveInterestParams, ListInterestsQuery, ListInterestsResult, InterestRepositoryPort } from '../../ports';
import { encodeOffsetCursor, parseOffsetCursor } from './offset-pagination';
import { InMemoryInterestCreationState, monitoringInterestNameKey } from './in-memory-interest-creation-state';

export class InMemoryInterestRepository implements InterestRepositoryPort {
  constructor(private readonly state = new InMemoryInterestCreationState()) {}

  private get interests() { return this.state.interests; }

  async save(interest: Interest): Promise<void> {
    const snapshot = interest.toSnapshot();
    for (const [name, id] of this.state.archivedNames) {
      if (id === snapshot.id && name.startsWith(`${snapshot.tenantId}:${snapshot.workspaceId}:`)) {
        this.state.archivedNames.delete(name);
      }
    }
    this.interests.set(this.key(snapshot.tenantId, snapshot.workspaceId, snapshot.id), interest);
  }

  async archive(params: ArchiveInterestParams): Promise<void> {
    const current = this.interests.get(this.key(params.tenantId, params.workspaceId, params.interestId));
    if (current) {
      const snapshot = current.toSnapshot();
      this.state.archivedNames.set(monitoringInterestNameKey(snapshot.tenantId, snapshot.workspaceId, snapshot.name), snapshot.id);
    }
    this.interests.delete(this.key(params.tenantId, params.workspaceId, params.interestId));
  }

  async findByName(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    name: string;
  }): Promise<Interest | null> {
    const normalizedName = params.name.trim();

    for (const interest of this.interests.values()) {
      const snapshot = interest.toSnapshot();
      if (
        snapshot.tenantId === params.tenantId &&
        snapshot.workspaceId === params.workspaceId &&
        snapshot.name === normalizedName
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
