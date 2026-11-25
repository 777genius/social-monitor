import { Controller, Get, Headers } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { requireTenantScope } from '@social-monitor/shared-kernel';

import { GetBetaLaunchSupportUseCase } from '../../features/get-beta-launch-support/get-beta-launch-support.use-case';
import type {
  BetaKnownLimitationsResponseDto,
  BetaLaunchSupportResponseDto,
  PostMvpBacklogResponseDto,
} from './beta-launch-support.dto';

@ApiTags('beta')
@Controller('beta/launch-support')
export class BetaLaunchSupportController {
  constructor(private readonly getBetaLaunchSupport: GetBetaLaunchSupportUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Get beta launch support snapshot with limitations and post-MVP backlog.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  async getSnapshot(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
  ): Promise<BetaLaunchSupportResponseDto> {
    this.requireScope(tenantHeader, workspaceHeader);
    const result = await this.getBetaLaunchSupport.execute();

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Get('known-limitations')
  @ApiOperation({ summary: 'List known beta limitations visible to users and support.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  async listKnownLimitations(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
  ): Promise<BetaKnownLimitationsResponseDto> {
    this.requireScope(tenantHeader, workspaceHeader);
    const result = await this.getBetaLaunchSupport.execute();

    if (!result.ok) {
      throw result.error;
    }

    return {
      schemaVersion: result.value.schemaVersion,
      snapshotId: result.value.snapshotId,
      publishedAt: result.value.publishedAt,
      launchMode: result.value.launchMode,
      knownLimitations: result.value.knownLimitations,
    };
  }

  @Get('post-mvp-backlog')
  @ApiOperation({ summary: 'List post-MVP backlog classification with architecture guardrails.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  async listPostMvpBacklog(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
  ): Promise<PostMvpBacklogResponseDto> {
    this.requireScope(tenantHeader, workspaceHeader);
    const result = await this.getBetaLaunchSupport.execute();

    if (!result.ok) {
      throw result.error;
    }

    return {
      schemaVersion: result.value.schemaVersion,
      snapshotId: result.value.snapshotId,
      publishedAt: result.value.publishedAt,
      postMvpBacklog: result.value.postMvpBacklog,
    };
  }

  private requireScope(tenantHeader: string | undefined, workspaceHeader: string | undefined): void {
    requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
  }
}
