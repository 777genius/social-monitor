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

import type { ReaderSummaryCadence, ReaderSummaryScope } from "../../domain";
import { GetReaderSummaryUseCase } from "../../features/get-reader-summary/get-reader-summary.use-case";
import { ListReaderSummariesUseCase } from "../../features/list-reader-summaries/list-reader-summaries.use-case";
import {
  readerSummaryResponseFromReaderSummary,
  listReaderSummariesResponseFromReaderSummaries,
} from "./reader-summary-rest.mapper";
import { ReaderSummaryResponseDto, ListReaderSummariesResponseDto } from "./reader-summary.dto";

@ApiTags("reader-summaries")
@Controller("reader-summaries")
export class ReaderSummaryController {
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
      "Comma-separated workspace roles. ReaderSummary reads allow owner, admin, member or viewer.",
  })
  @ApiQuery({
    name: "scopeType",
    required: false,
    enum: ["workspace", "topic"],
  })
  @ApiQuery({ name: "topicId", required: false, type: String })
  @ApiQuery({
    name: "cadence",
    required: false,
    enum: ["daily", "weekly", "monthly", "custom"],
  })
  @ApiQuery({ name: "periodStartedAt", required: false, type: String })
  @ApiQuery({ name: "periodEndedAt", required: false, type: String })
  @ApiQuery({ name: "timezone", required: false, type: String })
  @ApiQuery({ name: "providerKey", required: false, type: String })
  @ApiQuery({ name: "userId", required: false, type: String })
  @ApiQuery({ name: "subscriptionId", required: false, type: String })
  @ApiQuery({
    name: "freshnessStatus",
    required: false,
    enum: ["fresh", "stale"],
  })
  @ApiQuery({
    name: "memoryGuidanceApplied",
    required: false,
    type: Boolean,
  })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "cursor", required: false, type: String })
  @ApiOkResponse({ type: ListReaderSummariesResponseDto })
  async list(
    @Headers("x-tenant-id") tenantHeader: string | undefined,
    @Headers("x-workspace-id") workspaceHeader: string | undefined,
    @Headers("x-workspace-role") workspaceRoleHeader: string | undefined,
    @Headers("authorization") authorizationHeader: string | undefined,
    @Query("scopeType") scopeType: string | undefined,
    @Query("topicId") topicId: string | undefined,
    @Query("cadence") cadence: string | undefined,
    @Query("periodStartedAt") periodStartedAt: string | undefined,
    @Query("periodEndedAt") periodEndedAt: string | undefined,
    @Query("timezone") timezone: string | undefined,
    @Query("providerKey") providerKey: string | undefined,
    @Query("userId") userId: string | undefined,
    @Query("subscriptionId") subscriptionId: string | undefined,
    @Query("freshnessStatus") freshnessStatus: string | undefined,
    @Query("memoryGuidanceApplied") memoryGuidanceApplied: string | undefined,
    @Query("limit") limitQuery: string | undefined,
    @Query("cursor") cursor: string | undefined,
  ): Promise<ListReaderSummariesResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeReaderSummaryRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.listReaderSummaries.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      scope: normalizeReaderSummaryScopeQuery(scopeType, topicId),
      cadence: normalizeReaderSummaryCadenceFilter(cadence),
      periodStartedAt: normalizeReaderSummaryDateFilter(
        periodStartedAt,
        "periodStartedAt",
      ),
      periodEndedAt: normalizeReaderSummaryDateFilter(
        periodEndedAt,
        "periodEndedAt",
      ),
      timezone: normalizeOptionalReaderSummaryFilter(timezone),
      providerKey: normalizeOptionalReaderSummaryFilter(providerKey),
      userId: normalizeOptionalReaderSummaryFilter(userId),
      subscriptionId: normalizeOptionalReaderSummaryFilter(subscriptionId),
      freshnessStatus: normalizeReaderSummaryFreshnessStatus(freshnessStatus),
      memoryGuidanceApplied: normalizeReaderSummaryBooleanFilter(
        memoryGuidanceApplied,
        "memoryGuidanceApplied",
      ),
      limit: parsePaginationLimit(limitQuery, {
        defaultLimit: 20,
        invalidMessage: "ReaderSummary page limit must be between 1 and 100",
      }),
      cursor,
    });

    if (!result.ok) {
      throw result.error;
    }

    return listReaderSummariesResponseFromReaderSummaries(result.value);
  }

  @Get(":readerSummaryId")
  @ApiOperation({ summary: "Get one tenant/workspace summary by id." })
  @ApiHeader({ name: "x-tenant-id", required: true })
  @ApiHeader({ name: "x-workspace-id", required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: "read:summaries",
    workspaceRoleDescription:
      "Comma-separated workspace roles. ReaderSummary reads allow owner, admin, member or viewer.",
  })
  @ApiOkResponse({ type: ReaderSummaryResponseDto })
  async get(
    @Param("readerSummaryId") readerSummaryId: string,
    @Headers("x-tenant-id") tenantHeader: string | undefined,
    @Headers("x-workspace-id") workspaceHeader: string | undefined,
    @Headers("x-workspace-role") workspaceRoleHeader: string | undefined,
    @Headers("authorization") authorizationHeader: string | undefined,
  ): Promise<ReaderSummaryResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeReaderSummaryRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.getReaderSummary.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      readerSummaryId: readerSummaryId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return readerSummaryResponseFromReaderSummary(result.value);
  }

  private async authorizeReaderSummaryRead(
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

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}

const normalizeReaderSummaryScopeQuery = (
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
    "ReaderSummary scopeType must be workspace or topic",
  );
};

const normalizeReaderSummaryCadenceFilter = (
  value: string | undefined,
): ReaderSummaryCadence | undefined => {
  const normalized = normalizeOptionalReaderSummaryFilter(value);

  if (normalized === undefined) {
    return undefined;
  }

  if (
    normalized === "daily" ||
    normalized === "weekly" ||
    normalized === "monthly" ||
    normalized === "custom"
  ) {
    return normalized;
  }

  throw new DomainError(
    "validation.failed",
    "ReaderSummary cadence must be daily, weekly, monthly or custom",
  );
};

const normalizeReaderSummaryDateFilter = (
  value: string | undefined,
  name: string,
): Date | undefined => {
  const normalized = normalizeOptionalReaderSummaryFilter(value);

  if (normalized === undefined) {
    return undefined;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new DomainError(
      "validation.failed",
      `ReaderSummary ${name} must be a valid ISO date`,
    );
  }

  return parsed;
};

const normalizeOptionalReaderSummaryFilter = (
  value: string | undefined,
): string | undefined => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
};

const normalizeReaderSummaryFreshnessStatus = (
  value: string | undefined,
): "fresh" | "stale" | undefined => {
  const normalized = normalizeOptionalReaderSummaryFilter(value);

  if (normalized === undefined) {
    return undefined;
  }

  if (normalized === "fresh" || normalized === "stale") {
    return normalized;
  }

  throw new DomainError(
    "validation.failed",
    "ReaderSummary freshnessStatus must be fresh or stale",
  );
};

const normalizeReaderSummaryBooleanFilter = (
  value: string | undefined,
  name: string,
): boolean | undefined => {
  const normalized = normalizeOptionalReaderSummaryFilter(value);

  if (normalized === undefined) {
    return undefined;
  }

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new DomainError(
    "validation.failed",
    `ReaderSummary ${name} must be true or false`,
  );
};
