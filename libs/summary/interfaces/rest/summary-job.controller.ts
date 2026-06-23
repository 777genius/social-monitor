import { Controller, Get, Headers, Inject, Param } from "@nestjs/common";
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  type WorkspaceAuthorizationPolicyPort,
} from "@social-monitor/identity/ports";
import { WorkspaceRoleHeaderParser } from "@social-monitor/identity/interfaces/authorization/workspace-role-header.parser";
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
} from "@social-monitor/identity/interfaces/rest/api-key-request-authorizer";
import { ApiKeyOrWorkspaceRoleAuth } from "@social-monitor/identity/interfaces/rest/api-key-openapi.decorators";
import {
  requireTenantScope,
  type TenantId,
  type WorkspaceId,
} from "@social-monitor/shared-kernel";

import { GetSummaryJobStatusUseCase } from "../../features/get-summary-job-status/get-summary-job-status.use-case";
import { SummaryJobStatusResponseDto } from "./summary-job-status.dto";

@ApiTags("summaries")
@Controller("summary-jobs")
export class SummaryJobController {
  constructor(
    private readonly getSummaryJobStatus: GetSummaryJobStatusUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Get(":summaryJobId/status")
  @ApiOperation({ summary: "Get summary job status and safe timeline." })
  @ApiHeader({ name: "x-tenant-id", required: true })
  @ApiHeader({ name: "x-workspace-id", required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: "read:summaries",
    workspaceRoleDescription:
      "Comma-separated workspace roles. Summary job reads allow owner, admin, member or viewer.",
  })
  @ApiOkResponse({ type: SummaryJobStatusResponseDto })
  async getStatus(
    @Param("summaryJobId") summaryJobId: string,
    @Headers("x-tenant-id") tenantHeader: string | undefined,
    @Headers("x-workspace-id") workspaceHeader: string | undefined,
    @Headers("x-workspace-role") workspaceRoleHeader: string | undefined,
    @Headers("authorization") authorizationHeader: string | undefined,
  ): Promise<SummaryJobStatusResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeSummaryJobRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.getSummaryJobStatus.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      summaryJobId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  private async authorizeSummaryJobRead(
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
        operation: "summary_jobs.read",
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: "summary_jobs.read",
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}
