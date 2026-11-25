import { Controller, Get, Header, Headers } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetAuthSessionUseCase } from '@social-monitor/identity/features/get-auth-session/get-auth-session.use-case';
import { parseBearerToken } from '@social-monitor/identity/interfaces/authorization/bearer-authorization';

import { AppBootstrapResponseDto } from './app-bootstrap.dto';
import { AppBootstrapReaderSummaryQuery } from './app-bootstrap-reader-summary-query';

@ApiTags('app-bootstrap')
@Controller('app/bootstrap')
export class AppBootstrapController {
  constructor(
    private readonly getAuthSession: GetAuthSessionUseCase,
    private readonly readerSummaryQuery: AppBootstrapReaderSummaryQuery,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Restore the session and initial daily reader-summary data in one request.',
  })
  @ApiHeader({
    name: 'authorization',
    required: false,
    description: 'Bearer OIDC JWT user session token.',
  })
  @ApiOkResponse({ type: AppBootstrapResponseDto })
  @Header('Cache-Control', 'private, no-store')
  @Header('Pragma', 'no-cache')
  @Header('Vary', 'Authorization, Cookie')
  async get(
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<AppBootstrapResponseDto> {
    const sessionResult = await this.getAuthSession.execute({
      accessToken: parseBearerToken(authorizationHeader),
    });
    if (!sessionResult.ok) {
      throw sessionResult.error;
    }

    const session = sessionResult.value;
    const { tenantId, workspaceId } = session.selectedWorkspace;
    const readerSummaries = await this.readerSummaryQuery.execute({
      tenantId,
      workspaceId,
    });

    return {
      session,
      readerSummaries,
    };
  }
}
