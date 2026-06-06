import { Controller, Get, Headers, Param } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { requireTenantScope } from '@social-monitor/shared-kernel';

import { GetDeliveryAttemptUseCase } from '../../features/get-delivery-attempt/get-delivery-attempt.use-case';
import type { GetDeliveryAttemptResponseDto } from './delivery-attempts.dto';

@ApiTags('delivery')
@Controller('delivery/attempts')
export class DeliveryAttemptsController {
  constructor(private readonly getDeliveryAttempt: GetDeliveryAttemptUseCase) {}

  @Get(':deliveryAttemptId')
  @ApiOperation({ summary: 'Get one tenant/workspace delivery attempt status.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  async get(
    @Param('deliveryAttemptId') deliveryAttemptId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
  ): Promise<GetDeliveryAttemptResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const result = await this.getDeliveryAttempt.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      deliveryAttemptId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}
