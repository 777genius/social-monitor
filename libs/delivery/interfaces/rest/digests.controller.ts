import { Controller, Get, Headers, Inject, Param } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  parseWorkspaceRolesHeader,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { requireTenantScope } from '@social-monitor/shared-kernel';

import { GetDigestUseCase } from '../../features/get-digest/get-digest.use-case';
import type { GetDigestResponseDto } from './digests.dto';

@ApiTags('delivery')
@Controller('delivery/digests')
export class DigestsController {
  constructor(
    private readonly getDigest: GetDigestUseCase,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
  ) {}

  @Get(':digestId')
  @ApiOperation({ summary: 'Get one tenant/workspace digest with provenance.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Digest reads allow owner, admin, member or viewer.',
  })
  async get(
    @Param('digestId') digestId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
  ): Promise<GetDigestResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = this.workspaceAuthorization.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'digests.read',
      roles: parseWorkspaceRolesHeader(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

    const result = await this.getDigest.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      digestId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}
