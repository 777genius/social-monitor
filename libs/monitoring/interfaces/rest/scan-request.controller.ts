import { Controller, Get, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { WorkspaceRoleHeaderParser } from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
} from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import { ApiKeyOrWorkspaceRoleAuth } from '@social-monitor/identity/interfaces/rest/api-key-openapi.decorators';
import { buildRequestContext, parsePaginationLimit } from '@social-monitor/platform-request-context';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';
import { RecordPublicApiAuditEventUseCase } from '@social-monitor/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case';
import type { PublicApiAuditMetadataValue } from '@social-monitor/usage/ports';

import { ListSourceBindingDailyHistoryUseCase } from '../../features/list-source-binding-daily-history/list-source-binding-daily-history.use-case';
import { ListSourceBindingScansUseCase } from '../../features/list-source-binding-scans/list-source-binding-scans.use-case';
import type { SourceBindingScanHistoryItemView } from '../../features/list-source-binding-scans/list-source-binding-scans.result';
import { RequestScanUseCase } from '../../features/request-scan/request-scan.use-case';
import {
  ListScanRequestsResponseDto,
  ListSourceBindingDailyScanHistoryResponseDto,
  RequestScanResponseDto,
} from './request-scan.dto';
import type { ScanStatusResponseDto } from './scan-status.dto';

@ApiTags('scan-requests')
@Controller('source-bindings/:sourceBindingId/scan-requests')
export class ScanRequestController {
  constructor(
    private readonly requestScan: RequestScanUseCase,
    private readonly listSourceBindingScans: ListSourceBindingScansUseCase,
    private readonly listSourceBindingDailyHistory: ListSourceBindingDailyHistoryUseCase,
    private readonly recordPublicApiAuditEvent: RecordPublicApiAuditEventUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Get('daily')
  @ApiOperation({ summary: 'List daily scan history for a source binding.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:topics',
    workspaceRoleDescription: 'Comma-separated workspace roles. Daily scan history reads allow owner, admin, member or viewer.',
  })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiOkResponse({ type: ListSourceBindingDailyScanHistoryResponseDto })
  async daily(
    @Param('sourceBindingId') sourceBindingId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('days') daysQuery: string | undefined,
  ): Promise<ListSourceBindingDailyScanHistoryResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeScanRequestRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.listSourceBindingDailyHistory.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      sourceBindingId,
      days: parsePaginationLimit(daysQuery, {
        defaultLimit: 14,
        maxLimit: 90,
        fieldName: 'days',
        invalidMessage: 'Scan history days must be between 1 and 90',
      }),
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Get()
  @ApiOperation({ summary: 'List scan requests for a source binding.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:topics',
    workspaceRoleDescription: 'Comma-separated workspace roles. Scan request reads allow owner, admin, member or viewer.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ type: ListScanRequestsResponseDto })
  async list(
    @Param('sourceBindingId') sourceBindingId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListScanRequestsResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeScanRequestRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.listSourceBindingScans.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      sourceBindingId,
      limit: parsePaginationLimit(limitQuery, {
        defaultLimit: 20,
        invalidMessage: 'Scan request list limit must be between 1 and 100',
      }),
      cursor,
    });

    if (!result.ok) {
      throw result.error;
    }

    return {
      scanRequests: result.value.scanRequests.map(scanHistoryItemToResponse),
      nextCursor: result.value.nextCursor,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Request a scan for a source binding.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:scan_requests',
    workspaceRoleDescription: 'Comma-separated workspace roles. Manual scan requests require owner, admin or member.',
  })
  @ApiHeader({ name: 'x-correlation-id', required: false })
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiCreatedResponse({ type: RequestScanResponseDto })
  async create(
    @Param('sourceBindingId') sourceBindingId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId: string | undefined,
    @Headers('x-correlation-id') correlationHeader: string | undefined,
  ): Promise<RequestScanResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeScanRequestWrite(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const requestContext = buildRequestContext({
      requestId,
      correlationId: correlationHeader,
    });

    const result = await this.requestScan.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      sourceBindingId,
      idempotencyKey,
      correlationId: requestContext.correlationId,
    });

    if (!result.ok) {
      throw result.error;
    }

    if (result.value.created) {
      await this.recordScanRequestAuditEvent({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        resourceId: result.value.scanJobId,
        metadata: {
          sourceBindingId,
          status: result.value.status,
          created: result.value.created,
        },
      });
    }

    return result.value;
  }

  private async recordScanRequestAuditEvent(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly resourceId: string;
    readonly metadata?: Readonly<Record<string, PublicApiAuditMetadataValue>>;
  }): Promise<void> {
    const result = await this.recordPublicApiAuditEvent.execute({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      actorType: 'system',
      actorId: 'monitoring.scan-requests',
      action: 'scan_request.created',
      outcome: 'succeeded',
      resourceType: 'scan_job',
      resourceId: params.resourceId,
      metadata: params.metadata,
    });

    if (!result.ok) {
      throw result.error;
    }
  }

  private async authorizeScanRequestRead(
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
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }

  private async authorizeScanRequestWrite(
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
        requiredScope: 'write:scan_requests',
        operation: 'scan_requests.create',
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'scan_requests.create',
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}

const scanHistoryItemToResponse = (
  item: SourceBindingScanHistoryItemView,
): ScanStatusResponseDto => ({
  scanJobId: item.scanJobId,
  sourceBindingId: item.sourceBindingId,
  scanPolicyId: item.scanPolicyId,
  status: item.status,
  userState: item.userState,
  failureClass: item.failureClass,
  operatorAction: item.operatorAction,
  requestedAt: item.requestedAt.toISOString(),
  enqueuedAt: item.enqueuedAt?.toISOString(),
  completedAt: item.completedAt?.toISOString(),
  failureReason: item.failureReason,
  latestAttempt: item.latestAttempt === undefined
    ? undefined
    : {
        sourceBindingId: item.latestAttempt.sourceBindingId,
        status: item.latestAttempt.status,
        startedAt: item.latestAttempt.startedAt.toISOString(),
        finishedAt: item.latestAttempt.finishedAt?.toISOString(),
        fetched: item.latestAttempt.fetched,
        inserted: item.latestAttempt.inserted,
        skippedDuplicates: item.latestAttempt.skippedDuplicates,
        projected: item.latestAttempt.projected,
        failureReason: item.latestAttempt.failureReason,
      },
});
