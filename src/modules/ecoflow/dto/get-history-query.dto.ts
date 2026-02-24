import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Shorthand period values resolved to a `from` date relative to now.
 *
 * | value | window        |
 * |-------|---------------|
 * | 1h    | last 1 hour   |
 * | 6h    | last 6 hours  |
 * | 12h   | last 12 hours |
 * | 24h   | last 24 hours |
 * | 7d    | last 7 days   |
 * | 30d   | last 30 days  |
 */
export const HISTORY_PERIODS = ['1h', '6h', '12h', '24h', '7d', '30d'] as const;
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];

/** Milliseconds for each shorthand period. */
export const PERIOD_MS: Record<HistoryPeriod, number> = {
  '1h':  1 * 60 * 60 * 1_000,
  '6h':  6 * 60 * 60 * 1_000,
  '12h': 12 * 60 * 60 * 1_000,
  '24h': 24 * 60 * 60 * 1_000,
  '7d':  7 * 24 * 60 * 60 * 1_000,
  '30d': 30 * 24 * 60 * 60 * 1_000,
};

export class GetHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Device serial number to query',
    example: 'R331ZE1A9H7Q1042',
  })
  @IsString()
  @IsOptional()
  deviceSn?: string;

  @ApiPropertyOptional({
    description:
      'Shorthand time period (takes precedence over from/to when provided). ' +
      'Resolves to the last N hours/days relative to the current server time.',
    enum: HISTORY_PERIODS,
    example: '24h',
  })
  @IsIn(HISTORY_PERIODS)
  @IsOptional()
  period?: HistoryPeriod;

  @ApiPropertyOptional({
    description: 'Start of time range (ISO 8601). Ignored when `period` is set.',
    example: '2026-02-01T00:00:00.000Z',
  })
  @IsString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({
    description: 'End of time range (ISO 8601). Ignored when `period` is set.',
    example: '2026-02-02T00:00:00.000Z',
  })
  @IsString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of rows to return (default: 1000, max: 5000).',
    example: 1000,
    default: 1000,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  @IsOptional()
  limit?: number;
}
