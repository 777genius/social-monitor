import type { UserWorkspaceMembershipVerifierPort } from '../../../ports';
import type { PrismaIdentityClient } from './prisma-identity-client';
import { workspaceRoleFromPrisma } from './prisma-identity-records';

export class PrismaUserWorkspaceMembershipVerifier implements UserWorkspaceMembershipVerifierPort {
  constructor(private readonly prisma: PrismaIdentityClient) {}

  async verify(
    params: Parameters<UserWorkspaceMembershipVerifierPort['verify']>[0],
  ): Promise<Awaited<ReturnType<UserWorkspaceMembershipVerifierPort['verify']>>> {
    const record = await this.prisma.membership.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        user: { deletedAt: null },
        workspace: { deletedAt: null },
      },
    });

    if (record === null) {
      return null;
    }

    return {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      roles: [workspaceRoleFromPrisma(record.role)],
      source: 'durable',
    };
  }
}
