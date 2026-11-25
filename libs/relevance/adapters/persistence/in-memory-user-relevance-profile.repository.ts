import type { UserRelevanceProfile } from '../../domain';
import type { UserRelevanceProfileRepositoryPort } from '../../ports';

export class InMemoryUserRelevanceProfileRepository implements UserRelevanceProfileRepositoryPort {
  private readonly profiles = new Map<string, UserRelevanceProfile>();

  async save(profile: UserRelevanceProfile): Promise<void> {
    const snapshot = profile.toSnapshot();

    this.profiles.set(this.key({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      userId: snapshot.userId,
    }), profile);
  }

  async findByUser(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly userId: string;
  }): Promise<UserRelevanceProfile | null> {
    return this.profiles.get(this.key(params)) ?? null;
  }

  all(): readonly UserRelevanceProfile[] {
    return [...this.profiles.values()];
  }

  private key(params: { readonly tenantId: string; readonly workspaceId: string; readonly userId: string }): string {
    return [
      params.tenantId,
      params.workspaceId,
      params.userId.trim(),
    ].join(':');
  }
}
