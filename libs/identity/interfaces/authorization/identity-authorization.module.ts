import { Module } from '@nestjs/common';

import { StaticWorkspaceAuthorizationPolicy } from '../../adapters/authorization/static-workspace-authorization-policy';
import { WORKSPACE_AUTHORIZATION_POLICY } from '../../ports';
import {
  WORKSPACE_ROLE_HEADER_ENV,
  WorkspaceRoleHeaderParser,
  resolveWorkspaceRoleHeaderEnv,
} from './workspace-role-header.parser';

@Module({
  providers: [
    {
      provide: WORKSPACE_ROLE_HEADER_ENV,
      useFactory: () => resolveWorkspaceRoleHeaderEnv(process.env),
    },
    {
      provide: WORKSPACE_AUTHORIZATION_POLICY,
      useClass: StaticWorkspaceAuthorizationPolicy,
    },
    WorkspaceRoleHeaderParser,
  ],
  exports: [WORKSPACE_AUTHORIZATION_POLICY, WorkspaceRoleHeaderParser],
})
export class IdentityAuthorizationModule {}
