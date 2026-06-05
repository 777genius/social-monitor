import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { CreateTopicUseCase } from '../../features/create-topic/create-topic.use-case';
import { CreateTopicRequestDto, type CreateTopicResponseDto } from './create-topic.dto';

@ApiTags('topics')
@Controller('topics')
export class TopicController {
  constructor(private readonly createTopic: CreateTopicUseCase) {}

  @Post()
  @ApiOperation({ summary: 'Create a topic inside the current tenant/workspace.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  create(
    @Headers('x-tenant-id') tenantHeader: string,
    @Headers('x-workspace-id') workspaceHeader: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: CreateTopicRequestDto,
  ): Promise<CreateTopicResponseDto> {
    return this.createTopic
      .execute({
        tenantId: tenantId(tenantHeader),
        workspaceId: workspaceId(workspaceHeader),
        name: body.name,
        query: body.query,
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
