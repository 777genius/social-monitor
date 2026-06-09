import { Controller, Get, Headers, Inject, Param } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  parseWorkspaceRolesHeader,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { requireTenantScope } from '@social-monitor/shared-kernel';

import { GetDeliveryAttemptUseCase } from '../../features/get-delivery-attempt/get-delivery-attempt.use-case';
import type { GetDeliveryAttemptResponseDto } from './delivery-attempts.dto';

@ApiTags('delivery')
@Controller('delivery/attempts')
export class DeliveryAttemptsController {
  constructor(
    private readonly getDeliveryAttempt: GetDeliveryAttemptUseCase,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
  ) {}

  @Get(':deliveryAttemptId')
  @ApiOperation({ summary: 'Get one tenant/workspace delivery attempt status.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Delivery attempt reads allow owner, admin, member or viewer.',
  })
  async get(
    @Param('deliveryAttemptId') deliveryAttemptId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
  ): Promise<GetDeliveryAttemptResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = this.workspaceAuthorization.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'delivery_attempts.read',
      roles: parseWorkspaceRolesHeader(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

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
