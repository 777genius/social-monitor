import { ArrayMinSize, IsArray, IsString, MinLength } from 'class-validator';

import type { ApiKeyScope } from '../../domain';
import type { CreateApiKeyResult } from '../../features/create-api-key/create-api-key.result';
import type { ListApiKeysResult } from '../../features/list-api-keys/list-api-keys.result';
import type { RevokeApiKeyResult } from '../../features/revoke-api-key/revoke-api-key.result';

export class CreateApiKeyRequestDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  scopes!: ApiKeyScope[];
}

export type CreateApiKeyResponseDto = CreateApiKeyResult;
export type ListApiKeysResponseDto = ListApiKeysResult;
export type RevokeApiKeyResponseDto = RevokeApiKeyResult;
