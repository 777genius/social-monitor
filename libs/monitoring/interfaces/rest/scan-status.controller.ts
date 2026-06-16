import { Controller, Get, Headers, Inject, Param } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  parseWorkspaceRolesHeader,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
} from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import { ApiKeyOrWorkspaceRoleAuth } from '@social-monitor/identity/interfaces/rest/api-key-openapi.decorators';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

import { GetScanStatusUseCase } from '../../features/get-scan-status/get-scan-status.use-case';
import type { ScanStatusResponseDto } from './scan-status.dto';
import { buildScanStatusView } from './scan-status-view';

@ApiTags('scan-requests')
@Controller('scan-requests/:scanJobId/status')
export class ScanStatusController {
  constructor(
    private readonly getScanStatus: GetScanStatusUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get current scan job status.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:topics',
    workspaceRoleDescription: 'Comma-separated workspace roles. Scan job reads allow owner, admin, member or viewer.',
  })
  async get(
    @Param('scanJobId') scanJobId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<ScanStatusResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeScanStatusRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.getScanStatus.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      scanJobId,
    });

    if (!result.ok) {
      throw result.error;
    }

    const view = buildScanStatusView({
      status: result.value.status,
      failureReason: result.value.failureReason,
    });

    return {
      scanJobId: result.value.scanJobId,
      sourceBindingId: result.value.sourceBindingId,
      scanPolicyId: result.value.scanPolicyId,
      status: result.value.status,
      userState: view.userState,
      failureClass: view.failureClass,
      operatorAction: view.operatorAction,
      requestedAt: result.value.requestedAt.toISOString(),
      enqueuedAt: result.value.enqueuedAt?.toISOString(),
      completedAt: result.value.completedAt?.toISOString(),
      failureReason: result.value.failureReason,
      latestAttempt: result.value.latestAttempt === undefined
        ? undefined
        : {
            sourceBindingId: result.value.latestAttempt.sourceBindingId,
            status: result.value.latestAttempt.status,
            startedAt: result.value.latestAttempt.startedAt.toISOString(),
            finishedAt: result.value.latestAttempt.finishedAt?.toISOString(),
            fetched: result.value.latestAttempt.fetched,
            inserted: result.value.latestAttempt.inserted,
            skippedDuplicates: result.value.latestAttempt.skippedDuplicates,
            projected: result.value.latestAttempt.projected,
            failureReason: result.value.latestAttempt.failureReason,
          },
    };
  }

  private async authorizeScanStatusRead(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    workspaceRoleHeader: string | undefined,
    authorizationHeader: string | undefined,
  ): Promise<void> {
    if (hasBearerAuthorizationHeader(authorizationHeader)) {
      await this.apiKeyRequestAuthorizer.authorize({
        authorizationHeader,
        tenantId,
        workspaceId,
        requiredScope: 'read:topics',
        operation: 'scan_jobs.read',
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'scan_jobs.read',
      roles: parseWorkspaceRolesHeader(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}
