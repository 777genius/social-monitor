import { ApiProperty } from '@nestjs/swagger';

import type { AuthSessionUserRole } from '../../features/get-auth-session/get-auth-session.result';
import type { WorkspaceRole } from '../../ports';

const workspaceRoleValues = ['owner', 'admin', 'member', 'viewer'] as const satisfies readonly WorkspaceRole[];
const authSessionUserRoleValues = ['admin', 'user'] as const satisfies readonly AuthSessionUserRole[];

export class AuthSessionWorkspaceDto {
  @ApiProperty()
  declare readonly tenantId: string;

  @ApiProperty()
  declare readonly workspaceId: string;

  @ApiProperty()
  declare readonly tenantName: string;

  @ApiProperty()
  declare readonly workspaceName: string;

  @ApiProperty({ enum: workspaceRoleValues })
  declare readonly workspaceRole: WorkspaceRole;

  @ApiProperty()
  declare readonly statusLabel: string;
}

export class AuthSessionResponseDto {
  @ApiProperty()
  declare readonly userId: string;

  @ApiProperty()
  declare readonly userLabel: string;

  @ApiProperty({ enum: authSessionUserRoleValues })
  declare readonly userRole: AuthSessionUserRole;

  @ApiProperty({ type: AuthSessionWorkspaceDto })
  declare readonly selectedWorkspace: AuthSessionWorkspaceDto;

  @ApiProperty({ type: [AuthSessionWorkspaceDto] })
  declare readonly workspaces: readonly AuthSessionWorkspaceDto[];
}
