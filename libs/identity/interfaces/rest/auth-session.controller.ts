import { Controller, Get, Headers } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { GetAuthSessionUseCase } from '../../features/get-auth-session/get-auth-session.use-case';
import { parseBearerToken } from '../authorization/bearer-authorization';
import { AuthSessionResponseDto } from './auth-session.dto';

@ApiTags('auth')
@Controller('auth/session')
export class AuthSessionController {
  constructor(private readonly getAuthSession: GetAuthSessionUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Restore the current user session and verified workspace from a Bearer JWT.' })
  @ApiHeader({ name: 'authorization', required: false, description: 'Bearer OIDC JWT user session token.' })
  @ApiOkResponse({ type: AuthSessionResponseDto })
  async get(@Headers('authorization') authorizationHeader: string | undefined): Promise<AuthSessionResponseDto> {
    const result = await this.getAuthSession.execute({
      accessToken: parseBearerToken(authorizationHeader),
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}
