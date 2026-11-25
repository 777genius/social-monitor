import { Controller, Get, Headers, Inject, Query } from "@nestjs/common";
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
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

import { GetReaderSummaryWeeklyProjectionUseCase } from "../../features/get-reader-summary-weekly-projection/get-reader-summary-weekly-projection.use-case";
import { ReaderSummaryWeeklyProjectionResponseDto } from "./reader-summary-weekly-projection.dto";
import { readerSummaryWeeklyProjectionResponse } from "./reader-summary-weekly-projection-rest.mapper";

@ApiTags("reader-summaries")
@Controller("reader-summaries/weekly")
export class ReaderSummaryWeeklyProjectionController {
  constructor(
    private readonly getWeeklyProjection: GetReaderSummaryWeeklyProjectionUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Get()
  @ApiOperation({
    summary: "Get the certified Monday-Sunday UTC reader summary projection.",
  })
  @ApiHeader({ name: "x-tenant-id", required: true })
  @ApiHeader({ name: "x-workspace-id", required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: "read:summaries",
    workspaceRoleDescription:
      "Comma-separated workspace roles. ReaderSummary reads allow owner, admin, member or viewer.",
  })
  @ApiQuery({
    name: "weekStartedOn",
    required: true,
    type: String,
    format: "date",
    example: "2026-07-20",
  })
  @ApiOkResponse({ type: ReaderSummaryWeeklyProjectionResponseDto })
  async get(
    @Headers("x-tenant-id") tenantHeader: string | undefined,
    @Headers("x-workspace-id") workspaceHeader: string | undefined,
    @Headers("x-workspace-role") workspaceRoleHeader: string | undefined,
    @Headers("authorization") authorizationHeader: string | undefined,
    @Query("weekStartedOn") weekStartedOn: string | undefined,
  ): Promise<ReaderSummaryWeeklyProjectionResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorize(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );
    const result = await this.getWeeklyProjection.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      weekStartedOn: weekStartedOn ?? "",
    });
    if (!result.ok) throw result.error;
    return readerSummaryWeeklyProjectionResponse(result.value);
  }

  private async authorize(
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
        operation: "reader-summaries.read",
      });
      return;
    }
    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: "reader-summaries.read",
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });
    if (!authorization.ok) throw authorization.error;
  }
}
