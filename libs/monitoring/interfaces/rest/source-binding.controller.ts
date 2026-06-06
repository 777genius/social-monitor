import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { requireTenantScope } from '@social-monitor/shared-kernel';

import { BindSourceUseCase } from '../../features/bind-source/bind-source.use-case';
import { BindSourceRequestDto, type BindSourceResponseDto } from './bind-source.dto';

@ApiTags('source-bindings')
@Controller('topics/:topicId/source-bindings')
export class SourceBindingController {
  constructor(private readonly bindSource: BindSourceUseCase) {}

  @Post()
  @ApiOperation({ summary: 'Bind a production-safe source provider to a topic.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  create(
    @Param('topicId') topicId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: BindSourceRequestDto,
  ): Promise<BindSourceResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });

    return this.bindSource
      .execute({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        topicId,
        providerKey: body.providerKey,
        config: body.config,
        idempotencyKey,
        correlationId: requestId ?? crypto.randomUUID(),
      })
      .then((result) => {
        if (!result.ok) {
          throw result.error;
        }

        return result.value;
      });
  }
}
