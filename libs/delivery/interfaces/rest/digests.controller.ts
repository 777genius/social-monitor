import { Controller, Get, Headers, Param } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { requireTenantScope } from '@social-monitor/shared-kernel';

import { GetDigestUseCase } from '../../features/get-digest/get-digest.use-case';
import type { GetDigestResponseDto } from './digests.dto';

@ApiTags('delivery')
@Controller('delivery/digests')
export class DigestsController {
  constructor(private readonly getDigest: GetDigestUseCase) {}

  @Get(':digestId')
  @ApiOperation({ summary: 'Get one tenant/workspace digest with provenance.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  async get(
    @Param('digestId') digestId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
  ): Promise<GetDigestResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
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
