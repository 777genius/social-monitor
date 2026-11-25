import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateInterestRequestDto {
  @ApiProperty({ minLength: 2 })
  @IsString()
  @MinLength(2)
  declare readonly name: string;

  @ApiProperty({ minLength: 2 })
  @IsString()
  @MinLength(2)
  declare readonly query: string;
}
