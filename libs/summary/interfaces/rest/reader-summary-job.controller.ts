import { Controller, Get, Headers, Inject, Param } from "@nestjs/common";
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { WorkspaceRoleHeaderParser } from "@social-monitor/identity/interfaces/authorization/workspace-role-header.parser";
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
} from "@social-monitor/identity/interfaces/rest/api-key-request-authorizer";
import { ApiKeyOrWorkspaceRoleAuth } from "@social-monitor/identity/interfaces/rest/api-key-openapi.decorators";
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  type WorkspaceAuthorizationPolicyPort,
} from "@social-monitor/identity/ports";
import {
  requireTenantScope,
  type TenantId,
  type WorkspaceId,
} from "@social-monitor/shared-kernel";

import { GetReaderSummaryJobStatusUseCase } from "../../features/get-reader-summary-job-status/get-reader-summary-job-status.use-case";
import { GetReaderSummaryQualityRejectionUseCase } from "../../features/get-reader-summary-quality-rejection/get-reader-summary-quality-rejection.use-case";
import {
  readerSummaryJobStatusFromReaderSummary,
  readerSummaryQualityRejectionFromReaderSummary,
} from "./reader-summary-rest.mapper";
import {
  ReaderSummaryJobStatusResponseDto,
  ReaderSummaryQualityRejectionResponseDto,
} from "./reader-summary-job-status.dto";

@ApiTags("reader-summaries")
@Controller("reader-summary-jobs")
export class ReaderSummaryJobController {
  constructor(
    private readonly getReaderSummaryJobStatus: GetReaderSummaryJobStatusUseCase,
    private readonly getReaderSummaryQualityRejection: GetReaderSummaryQualityRejectionUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Get(":readerSummaryJobId/status")
  @ApiOperation({ summary: "Get readerSummary job status and safe timeline." })
  @ApiHeader({ name: "x-tenant-id", required: true })
  @ApiHeader({ name: "x-workspace-id", required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: "read:summaries",
    workspaceRoleDescription:
      "Comma-separated workspace roles. ReaderSummary job reads allow owner, admin, member or viewer.",
  })
  @ApiOkResponse({ type: ReaderSummaryJobStatusResponseDto })
  async getStatus(
    @Param("readerSummaryJobId") readerSummaryJobId: string,
    @Headers("x-tenant-id") tenantHeader: string | undefined,
    @Headers("x-workspace-id") workspaceHeader: string | undefined,
    @Headers("x-workspace-role") workspaceRoleHeader: string | undefined,
    @Headers("authorization") authorizationHeader: string | undefined,
  ): Promise<ReaderSummaryJobStatusResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeReaderSummaryJobRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.getReaderSummaryJobStatus.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      readerSummaryJobId: readerSummaryJobId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return readerSummaryJobStatusFromReaderSummary(result.value);
  }

  @Get(":readerSummaryJobId/quality-rejection")
  @ApiOperation({
    summary: "Get safe quality rejection diagnostics for a readerSummary job.",
  })
  @ApiHeader({ name: "x-tenant-id", required: true })
  @ApiHeader({ name: "x-workspace-id", required: true })
  @ApiHeader({
    name: "authorization",
    required: false,
    description:
      "Bearer OIDC JWT for production ReaderSummary quality rejection diagnostics.",
  })
  @ApiHeader({
    name: "x-workspace-role",
    required: false,
    description:
      "Local-dev fallback only. ReaderSummary quality rejection diagnostics require owner or admin.",
  })
  @ApiOkResponse({ type: ReaderSummaryQualityRejectionResponseDto })
  async getQualityRejection(
    @Param("readerSummaryJobId") readerSummaryJobId: string,
    @Headers("x-tenant-id") tenantHeader: string | undefined,
    @Headers("x-workspace-id") workspaceHeader: string | undefined,
    @Headers("x-workspace-role") workspaceRoleHeader: string | undefined,
    @Headers("authorization") authorizationHeader: string | undefined,
  ): Promise<ReaderSummaryQualityRejectionResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeReaderSummaryRejectionRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.getReaderSummaryQualityRejection.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      readerSummaryJobId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return readerSummaryQualityRejectionFromReaderSummary(result.value);
  }

  private async authorizeReaderSummaryJobRead(
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
        requiredScope: "read:summaries",
        operation: "reader_summary_jobs.read",
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: "reader_summary_jobs.read",
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }

  private async authorizeReaderSummaryRejectionRead(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    workspaceRoleHeader: string | undefined,
    authorizationHeader: string | undefined,
  ): Promise<void> {
    if (hasBearerAuthorizationHeader(authorizationHeader)) {
      await this.apiKeyRequestAuthorizer.authorizeUser({
        authorizationHeader,
        tenantId,
        workspaceId,
        operation: "reader_summary_rejections.read",
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: "reader_summary_rejections.read",
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}
