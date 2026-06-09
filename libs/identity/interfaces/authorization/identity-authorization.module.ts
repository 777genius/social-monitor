import { Module } from '@nestjs/common';

import { StaticWorkspaceAuthorizationPolicy } from '../../adapters/authorization/static-workspace-authorization-policy';
import { WORKSPACE_AUTHORIZATION_POLICY } from '../../ports';

@Module({
  providers: [
    {
      provide: WORKSPACE_AUTHORIZATION_POLICY,
      useClass: StaticWorkspaceAuthorizationPolicy,
    },
  ],
  exports: [WORKSPACE_AUTHORIZATION_POLICY],
})
export class IdentityAuthorizationModule {}
