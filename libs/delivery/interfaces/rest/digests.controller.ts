import { Controller, Get, Headers, Param } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { requireTenantScope } from '@social-monitor/shared-kernel';

import { GetDigestUseCase } from '../../features/get-digest/get-digest.use-case';
import { DeliveryReadAuthorizer } from './delivery-read.authorizer';
import type { GetDigestResponseDto } from './digests.dto';

@ApiTags('delivery')
@Controller('delivery/digests')
export class DigestsController {
  constructor(
    private readonly getDigest: GetDigestUseCase,
    private readonly deliveryReadAuthorizer: DeliveryReadAuthorizer,
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
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<GetDigestResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.deliveryReadAuthorizer.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
      action: 'digests.read',
      operation: 'digests.read',
    });

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
