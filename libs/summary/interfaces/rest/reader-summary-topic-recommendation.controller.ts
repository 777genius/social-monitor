import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBody,
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
import { DecideReaderSummaryTopicRecommendationUseCase } from "../../features/decide-reader-summary-topic-recommendation/decide-reader-summary-topic-recommendation.use-case";
import { ListReaderSummaryTopicRecommendationsUseCase } from "../../features/list-reader-summary-topic-recommendations/list-reader-summary-topic-recommendations.use-case";
import {
  DecideReaderSummaryTopicRecommendationRequestDto,
  DecideReaderSummaryTopicRecommendationResponseDto,
  ListReaderSummaryTopicRecommendationsResponseDto,
  readerSummaryTopicRecommendationDecisionResponse,
  readerSummaryTopicRecommendationsResponse,
} from "./reader-summary-topic-recommendation.dto";

@ApiTags("reader-summaries")
@Controller("reader-summary-topic-recommendations")
export class ReaderSummaryTopicRecommendationController {
  constructor(
    private readonly listRecommendations: ListReaderSummaryTopicRecommendationsUseCase,
    private readonly decideRecommendation: DecideReaderSummaryTopicRecommendationUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List topic promotion recommendations from recent summaries.",
  })
  @ApiHeader({ name: "x-tenant-id", required: true })
  @ApiHeader({ name: "x-workspace-id", required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: "read:summaries",
    workspaceRoleDescription:
      "ReaderSummary recommendation reads allow owner, admin, member or viewer.",
  })
  @ApiQuery({
    name: "scopeType",
    required: false,
    enum: ["workspace", "interest"],
  })
  @ApiQuery({ name: "interestId", required: false, type: String })
  @ApiQuery({ name: "windowDays", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ type: ListReaderSummaryTopicRecommendationsResponseDto })
  async list(
    @Headers("x-tenant-id") tenantHeader: string | undefined,
    @Headers("x-workspace-id") workspaceHeader: string | undefined,
    @Headers("x-workspace-role") workspaceRoleHeader: string | undefined,
    @Headers("authorization") authorizationHeader: string | undefined,
    @Query("scopeType") scopeType: string | undefined,
    @Query("interestId") interestId: string | undefined,
    @Query("windowDays") windowDays: string | undefined,
    @Query("limit") limitQuery: string | undefined,
  ): Promise<ListReaderSummaryTopicRecommendationsResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.listRecommendations.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      scope: normalizeScope(scopeType, interestId),
      windowDays: normalizeWindowDays(windowDays),
      limit: parsePaginationLimit(limitQuery, {
        defaultLimit: 8,
        maxLimit: 20,
        invalidMessage:
          "ReaderSummary topic recommendation limit must be between 1 and 20",
      }),
    });

    if (!result.ok) {
      throw result.error;
    }

    return readerSummaryTopicRecommendationsResponse(result.value);
  }

  @Post(":recommendationId/decision")
  @ApiOperation({
    summary: "Accept, reject or undo a topic promotion recommendation.",
  })
  @ApiHeader({ name: "x-tenant-id", required: true })
  @ApiHeader({ name: "x-workspace-id", required: true })
  @ApiHeader({ name: "x-user-id", required: false })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: "write:summaries",
    workspaceRoleDescription:
      "ReaderSummary topic recommendation decisions allow owner or admin.",
  })
  @ApiBody({ type: DecideReaderSummaryTopicRecommendationRequestDto })
  @ApiOkResponse({ type: DecideReaderSummaryTopicRecommendationResponseDto })
  async decide(
    @Headers("x-tenant-id") tenantHeader: string | undefined,
    @Headers("x-workspace-id") workspaceHeader: string | undefined,
    @Headers("x-workspace-role") workspaceRoleHeader: string | undefined,
    @Headers("authorization") authorizationHeader: string | undefined,
    @Headers("x-user-id") userIdHeader: string | undefined,
    @Param("recommendationId") recommendationId: string,
    @Body() body: DecideReaderSummaryTopicRecommendationRequestDto,
  ): Promise<DecideReaderSummaryTopicRecommendationResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeDecision(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.decideRecommendation.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      recommendationId,
      topicLabel: body.topicLabel,
      action: body.action,
      interestIds: body.interestIds,
      providerKeys: body.providerKeys,
      note: body.note,
      decidedBy: normalizedActor(userIdHeader),
    });

    if (!result.ok) {
      throw result.error;
    }

    return readerSummaryTopicRecommendationDecisionResponse(result.value);
  }

  private async authorizeRead(
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
        operation: "reader-summaries.topic-recommendations.read",
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: "reader-summaries.read",
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }

  private async authorizeDecision(
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
        requiredScope: "write:summaries",
        operation: "reader_summary_topic_recommendations.decide",
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: "reader_summary_topic_recommendations.decide",
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}

const normalizeScope = (
  scopeType: string | undefined,
  interestId: string | undefined,
): ReaderSummaryScope | undefined => {
  if (scopeType === undefined || scopeType.trim().length === 0) {
    return undefined;
  }

  if (scopeType === "workspace") {
    return { type: "workspace" };
  }

  if (scopeType === "interest") {
    return { type: "interest", interestId: interestId ?? "" };
  }

  throw new DomainError(
    "validation.failed",
    "ReaderSummary scopeType must be workspace or interest",
  );
};

const normalizeWindowDays = (value: string | undefined): number => {
  if (value === undefined || value.trim().length === 0) {
    return 14;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new DomainError(
      "validation.failed",
      "ReaderSummary topic recommendation windowDays must be an integer",
    );
  }

  return parsed;
};

const normalizedActor = (value: string | undefined): string => {
  const actor = value?.trim() ?? "";

  return actor.length === 0 ? "workspace-admin" : actor;
};
