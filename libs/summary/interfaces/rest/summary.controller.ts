import {
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
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
  parsePaginationLimit,
  RequestCorrelationIdFactory,
  requireIdempotencyKeyHeader,
} from "@social-monitor/platform-request-context";
import {
  requireTenantScope,
  type TenantId,
  type WorkspaceId,
} from "@social-monitor/shared-kernel";

import { GetSummaryUseCase } from "../../features/get-summary/get-summary.use-case";
import { ListSummariesUseCase } from "../../features/list-summaries/list-summaries.use-case";
import { RegenerateSummaryUseCase } from "../../features/regenerate-summary/regenerate-summary.use-case";
import { RegenerateSummaryResponseDto } from "./regenerate-summary.dto";
import { ListSummariesResponseDto, SummaryResponseDto } from "./summary.dto";

@ApiTags("summaries")
@Controller("summaries")
export class SummaryController {
  constructor(
    private readonly listSummaries: ListSummariesUseCase,
    private readonly getSummary: GetSummaryUseCase,
    private readonly regenerateSummary: RegenerateSummaryUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
    private readonly requestCorrelationIds: RequestCorrelationIdFactory,
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
      "Comma-separated workspace roles. Summary reads allow owner, admin, member or viewer.",
  })
  @ApiQuery({ name: "topicId", required: false, type: String })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "cursor", required: false, type: String })
  @ApiOkResponse({ type: ListSummariesResponseDto })
  async list(
    @Headers("x-tenant-id") tenantHeader: string | undefined,
    @Headers("x-workspace-id") workspaceHeader: string | undefined,
    @Headers("x-workspace-role") workspaceRoleHeader: string | undefined,
    @Headers("authorization") authorizationHeader: string | undefined,
    @Query("topicId") topicId: string | undefined,
    @Query("limit") limitQuery: string | undefined,
    @Query("cursor") cursor: string | undefined,
  ): Promise<ListSummariesResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeSummaryRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.listSummaries.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      topicId: normalizeTopicId(topicId),
      limit: parsePaginationLimit(limitQuery, {
        defaultLimit: 20,
        invalidMessage: "Summary page limit must be between 1 and 100",
      }),
      cursor,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Get(":summaryId")
  @ApiOperation({ summary: "Get one tenant/workspace summary by id." })
  @ApiHeader({ name: "x-tenant-id", required: true })
  @ApiHeader({ name: "x-workspace-id", required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: "read:summaries",
    workspaceRoleDescription:
      "Comma-separated workspace roles. Summary reads allow owner, admin, member or viewer.",
  })
  @ApiOkResponse({ type: SummaryResponseDto })
  async get(
    @Param("summaryId") summaryId: string,
    @Headers("x-tenant-id") tenantHeader: string | undefined,
    @Headers("x-workspace-id") workspaceHeader: string | undefined,
    @Headers("x-workspace-role") workspaceRoleHeader: string | undefined,
    @Headers("authorization") authorizationHeader: string | undefined,
  ): Promise<SummaryResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeSummaryRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.getSummary.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      summaryId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Post(":summaryId/regenerations")
  @ApiOperation({ summary: "Request regeneration for an existing summary." })
  @ApiHeader({ name: "x-tenant-id", required: true })
  @ApiHeader({ name: "x-workspace-id", required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: "write:summaries",
    workspaceRoleDescription:
      "Comma-separated workspace roles. Summary regenerations require owner, admin or member.",
  })
  @ApiHeader({ name: "idempotency-key", required: true })
  @ApiCreatedResponse({ type: RegenerateSummaryResponseDto })
  async regenerate(
    @Param("summaryId") summaryId: string,
    @Headers("x-tenant-id") tenantHeader: string | undefined,
    @Headers("x-workspace-id") workspaceHeader: string | undefined,
    @Headers("x-workspace-role") workspaceRoleHeader: string | undefined,
    @Headers("authorization") authorizationHeader: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
  ): Promise<RegenerateSummaryResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeSummaryWrite(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
      "summary_regenerations.create",
    );

    const result = await this.regenerateSummary.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      summaryId,
      idempotencyKey: requireIdempotencyKeyHeader(idempotencyKey),
      correlationId: this.requestCorrelationIds.fromRequestId(requestId),
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  private async authorizeSummaryRead(
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
        operation: "summaries.read",
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: "summaries.read",
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }

  private async authorizeSummaryWrite(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    workspaceRoleHeader: string | undefined,
    authorizationHeader: string | undefined,
    operation: "summary_regenerations.create",
  ): Promise<void> {
    if (hasBearerAuthorizationHeader(authorizationHeader)) {
      await this.apiKeyRequestAuthorizer.authorize({
        authorizationHeader,
        tenantId,
        workspaceId,
        requiredScope: "write:summaries",
        operation,
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: operation,
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}

const normalizeTopicId = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
};
