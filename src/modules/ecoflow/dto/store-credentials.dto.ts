import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StoreCredentialsDto {
  @ApiProperty({ description: 'EcoFlow API Access Key' })
  @IsString()
  @IsNotEmpty()
  accessKey!: string;

  @ApiProperty({ description: 'EcoFlow API Secret Key' })
  @IsString()
  @IsNotEmpty()
  secretKey!: string;

  @ApiProperty({ description: 'Optional label for this credential set', required: false })
  @IsString()
  @IsOptional()
  label?: string;
}
