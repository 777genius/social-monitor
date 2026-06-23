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

import { GetBriefingJobStatusUseCase } from "../../features/get-briefing-job-status/get-briefing-job-status.use-case";
import { BriefingJobStatusResponseDto } from "./briefing-job-status.dto";

@ApiTags("briefings")
@Controller("briefing-jobs")
export class BriefingJobController {
  constructor(
    private readonly getBriefingJobStatus: GetBriefingJobStatusUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Get(":briefingJobId/status")
  @ApiOperation({ summary: "Get briefing job status and safe timeline." })
  @ApiHeader({ name: "x-tenant-id", required: true })
  @ApiHeader({ name: "x-workspace-id", required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: "read:summaries",
    workspaceRoleDescription:
      "Comma-separated workspace roles. Briefing job reads allow owner, admin, member or viewer.",
  })
  @ApiOkResponse({ type: BriefingJobStatusResponseDto })
  async getStatus(
    @Param("briefingJobId") briefingJobId: string,
    @Headers("x-tenant-id") tenantHeader: string | undefined,
    @Headers("x-workspace-id") workspaceHeader: string | undefined,
    @Headers("x-workspace-role") workspaceRoleHeader: string | undefined,
    @Headers("authorization") authorizationHeader: string | undefined,
  ): Promise<BriefingJobStatusResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeBriefingJobRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.getBriefingJobStatus.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      briefingJobId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  private async authorizeBriefingJobRead(
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
        operation: "briefing_jobs.read",
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: "briefing_jobs.read",
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}
