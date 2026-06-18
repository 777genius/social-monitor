import { Module } from '@nestjs/common';
import { SystemClock } from '@social-monitor/shared-kernel';

import { ClaimUserWorkspaceMembershipVerifier } from '../../adapters/authorization/claim-user-workspace-membership.verifier';
import { JwksUserAccessTokenVerifier } from '../../adapters/authorization/jwks-user-access-token.verifier';
import { RejectingUserAccessTokenVerifier } from '../../adapters/authorization/rejecting-user-access-token.verifier';
import type { PrismaIdentityClient } from '../../adapters/persistence/prisma/prisma-identity-client';
import { PrismaIdentityConnection } from '../../adapters/persistence/prisma/prisma-identity-connection';
import { PrismaUserWorkspaceMembershipVerifier } from '../../adapters/persistence/prisma/prisma-user-workspace-membership.verifier';
import {
  USER_ACCESS_TOKEN_VERIFIER,
  USER_WORKSPACE_MEMBERSHIP_VERIFIER,
  type UserAccessTokenVerifierPort,
  type UserWorkspaceMembershipVerifierPort,
} from '../../ports';
import {
  IDENTITY_PERSISTENCE_MODE,
  IDENTITY_PRISMA_CLIENT,
  IDENTITY_USER_ACCESS_TOKEN_CONFIG,
  resolveIdentityPersistenceMode,
  resolveIdentityUserAccessTokenConfig,
  type IdentityPersistenceMode,
  type IdentityUserAccessTokenConfig,
} from '../rest/identity-provider-tokens';
import { IdentityAuthorizationModule } from './identity-authorization.module';
import { UserWorkspaceRequestAuthorizer } from './user-workspace-request.authorizer';

@Module({
  imports: [IdentityAuthorizationModule],
  providers: [
    {
      provide: IDENTITY_PERSISTENCE_MODE,
      useFactory: () => resolveIdentityPersistenceMode(process.env),
    },
    {
      provide: IDENTITY_USER_ACCESS_TOKEN_CONFIG,
      useFactory: () => resolveIdentityUserAccessTokenConfig(process.env),
    },
    {
      provide: USER_ACCESS_TOKEN_VERIFIER,
      useFactory: (config: IdentityUserAccessTokenConfig): UserAccessTokenVerifierPort =>
        config.mode === 'oidc-jwt'
          ? new JwksUserAccessTokenVerifier(config, new SystemClock())
          : new RejectingUserAccessTokenVerifier(),
      inject: [IDENTITY_USER_ACCESS_TOKEN_CONFIG],
    },
    {
      provide: IDENTITY_PRISMA_CLIENT,
      useFactory: (mode: IdentityPersistenceMode): PrismaIdentityClient | null =>
        mode === 'prisma' ? new PrismaIdentityConnection(process.env.DATABASE_URL ?? '') : null,
      inject: [IDENTITY_PERSISTENCE_MODE],
    },
    {
      provide: USER_WORKSPACE_MEMBERSHIP_VERIFIER,
      useFactory: (
        mode: IdentityPersistenceMode,
        prisma: PrismaIdentityClient | null,
      ): UserWorkspaceMembershipVerifierPort =>
        mode === 'prisma'
          ? new PrismaUserWorkspaceMembershipVerifier(requirePrismaIdentityClient(prisma))
          : new ClaimUserWorkspaceMembershipVerifier(),
      inject: [IDENTITY_PERSISTENCE_MODE, IDENTITY_PRISMA_CLIENT],
    },
    UserWorkspaceRequestAuthorizer,
  ],
  exports: [
    IDENTITY_PERSISTENCE_MODE,
    IDENTITY_PRISMA_CLIENT,
    USER_ACCESS_TOKEN_VERIFIER,
    USER_WORKSPACE_MEMBERSHIP_VERIFIER,
    UserWorkspaceRequestAuthorizer,
    IdentityAuthorizationModule,
  ],
})
export class IdentityUserAuthModule {}

export const requirePrismaIdentityClient = (client: PrismaIdentityClient | null): PrismaIdentityClient => {
  if (client === null) {
    throw new Error('Prisma identity client is required when IDENTITY_PERSISTENCE=prisma');
  }

  return client;
};
