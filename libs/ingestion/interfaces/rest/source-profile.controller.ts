import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ListSourceProfilesUseCase } from '../../features/list-source-profiles/list-source-profiles.use-case';
import type { ListSourceProfilesResponseDto } from './source-profile.dto';

@ApiTags('sources')
@Controller('sources/profiles')
export class SourceProfileController {
  constructor(private readonly listSourceProfiles: ListSourceProfilesUseCase) {}

  @Get()
  @ApiOperation({ summary: 'List source capability and readiness profiles.' })
  async list(): Promise<ListSourceProfilesResponseDto> {
    const result = await this.listSourceProfiles.execute();

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}
