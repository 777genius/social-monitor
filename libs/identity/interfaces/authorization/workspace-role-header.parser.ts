import { Inject, Injectable } from '@nestjs/common';

import {
  parseWorkspaceRolesHeader,
  type WorkspaceRoleHeaderEnv,
} from '../../ports';

export const WORKSPACE_ROLE_HEADER_ENV = Symbol('WORKSPACE_ROLE_HEADER_ENV');

export const resolveWorkspaceRoleHeaderEnv = (env: NodeJS.ProcessEnv): WorkspaceRoleHeaderEnv => ({
  NODE_ENV: env.NODE_ENV,
  SOCIAL_MONITOR_RUNTIME_PROFILE: env.SOCIAL_MONITOR_RUNTIME_PROFILE,
  TRUSTED_WORKSPACE_ROLE_HEADER: env.TRUSTED_WORKSPACE_ROLE_HEADER,
});

@Injectable()
export class WorkspaceRoleHeaderParser {
  constructor(
    @Inject(WORKSPACE_ROLE_HEADER_ENV)
    private readonly env: WorkspaceRoleHeaderEnv,
  ) {}

  parse(header: string | undefined): readonly string[] {
    return parseWorkspaceRolesHeader(header, this.env);
  }
}
