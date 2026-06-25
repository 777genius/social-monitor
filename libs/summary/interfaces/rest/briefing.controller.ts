import { Controller, Get, Headers, Inject, Param, Query } from "@nestjs/common";
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
import { parsePaginationLimit } from "@social-monitor/platform-request-context";
import {
  DomainError,
  requireTenantScope,
  type TenantId,
  type WorkspaceId,
} from "@social-monitor/shared-kernel";

import type { ReaderSummaryScope } from "../../domain";
import { GetReaderSummaryUseCase } from "../../features/get-reader-summary/get-reader-summary.use-case";
import { ListReaderSummariesUseCase } from "../../features/list-reader-summaries/list-reader-summaries.use-case";
import {
  briefingResponseFromReaderSummary,
  listBriefingsResponseFromReaderSummaries,
} from "./briefing-legacy.mapper";
import { BriefingResponseDto, ListBriefingsResponseDto } from "./briefing.dto";

@ApiTags("briefings")
@Controller("briefings")
export class BriefingController {
  constructor(
    private readonly listReaderSummaries: ListReaderSummariesUseCase,
    private readonly getReaderSummary: GetReaderSummaryUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List tenant/workspace summaries with cursor pagination.",
  })
  @ApiHeader({ name: "x-tenant-id", required: true })
  @ApiHeader({ name: "x-workspace-id", required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: "read:summaries",
    workspaceRoleDescription:
      "Comma-separated workspace roles. Briefing reads allow owner, admin, member or viewer.",
  })
  @ApiQuery({
    name: "scopeType",
    required: false,
    enum: ["workspace", "topic"],
  })
  @ApiQuery({ name: "topicId", required: false, type: String })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "cursor", required: false, type: String })
  @ApiOkResponse({ type: ListBriefingsResponseDto })
  async list(
    @Headers("x-tenant-id") tenantHeader: string | undefined,
    @Headers("x-workspace-id") workspaceHeader: string | undefined,
    @Headers("x-workspace-role") workspaceRoleHeader: string | undefined,
    @Headers("authorization") authorizationHeader: string | undefined,
    @Query("scopeType") scopeType: string | undefined,
    @Query("topicId") topicId: string | undefined,
    @Query("limit") limitQuery: string | undefined,
    @Query("cursor") cursor: string | undefined,
  ): Promise<ListBriefingsResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeBriefingRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.listReaderSummaries.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      scope: normalizeBriefingScopeQuery(scopeType, topicId),
      limit: parsePaginationLimit(limitQuery, {
        defaultLimit: 20,
        invalidMessage: "Briefing page limit must be between 1 and 100",
      }),
      cursor,
    });

    if (!result.ok) {
      throw result.error;
    }

    return listBriefingsResponseFromReaderSummaries(result.value);
  }

  @Get(":briefingId")
  @ApiOperation({ summary: "Get one tenant/workspace summary by id." })
  @ApiHeader({ name: "x-tenant-id", required: true })
  @ApiHeader({ name: "x-workspace-id", required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: "read:summaries",
    workspaceRoleDescription:
      "Comma-separated workspace roles. Briefing reads allow owner, admin, member or viewer.",
  })
  @ApiOkResponse({ type: BriefingResponseDto })
  async get(
    @Param("briefingId") briefingId: string,
    @Headers("x-tenant-id") tenantHeader: string | undefined,
    @Headers("x-workspace-id") workspaceHeader: string | undefined,
    @Headers("x-workspace-role") workspaceRoleHeader: string | undefined,
    @Headers("authorization") authorizationHeader: string | undefined,
  ): Promise<BriefingResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeBriefingRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.getReaderSummary.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      readerSummaryId: briefingId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return briefingResponseFromReaderSummary(result.value);
  }

  private async authorizeBriefingRead(
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
        operation: "briefings.read",
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: "briefings.read",
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}

const normalizeBriefingScopeQuery = (
  scopeType: string | undefined,
  topicId: string | undefined,
): ReaderSummaryScope | undefined => {
  if (scopeType === undefined || scopeType.trim().length === 0) {
    return undefined;
  }

  if (scopeType === "workspace") {
    return { type: "workspace" };
  }

  if (scopeType === "topic") {
    return { type: "topic", topicId: topicId ?? "" };
  }

  throw new DomainError(
    "validation.failed",
    "Briefing scopeType must be workspace or topic",
  );
};
