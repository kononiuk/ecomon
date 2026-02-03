import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeviceCommandDto {
  @ApiProperty({ description: 'Command parameters as JSON object' })
  @IsObject()
  params!: Record<string, any>;
}
