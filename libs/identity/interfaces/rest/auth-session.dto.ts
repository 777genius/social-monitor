import { ApiProperty } from '@nestjs/swagger';

import type { WorkspaceRole } from '../../ports';

const workspaceRoleValues = ['owner', 'admin', 'member', 'viewer'] as const satisfies readonly WorkspaceRole[];

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

  @ApiProperty({ type: AuthSessionWorkspaceDto })
  declare readonly selectedWorkspace: AuthSessionWorkspaceDto;

  @ApiProperty({ type: [AuthSessionWorkspaceDto] })
  declare readonly workspaces: readonly AuthSessionWorkspaceDto[];
}
