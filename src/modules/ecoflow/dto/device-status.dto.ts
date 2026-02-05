import { ApiProperty } from '@nestjs/swagger';

export class ChargeDto {
  @ApiProperty({ description: 'State of charge (0–100)' })
  percent!: number;
}

export class DeviceStatusDto {
  @ApiProperty({ description: 'Human-readable device name from EcoFlow account' })
  name!: string;

  @ApiProperty({ description: 'Current charge level', type: () => ChargeDto })
  charge!: ChargeDto;

  @ApiProperty({ description: 'Total watts currently flowing into the device' })
  inputWatts!: number;

  @ApiProperty({ description: 'Total watts currently being delivered out' })
  outputWatts!: number;

  @ApiProperty({ description: 'Whether AC mains power is plugged in and active' })
  gridConnected!: boolean;

  @ApiProperty({
    description: 'Full unprocessed EcoFlow properties — included only when ?raw=true',
    nullable: true,
    required: false,
  })
  raw: Record<string, unknown> | null = null;
}
