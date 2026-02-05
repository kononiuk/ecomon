import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { HistoryService } from './history.service';

/**
 * Maintenance cron — runs independently of monitor start/stop state.
 * Deletes history rows older than the configured retention window once per day.
 *
 * Retention is controlled by the HISTORY_RETENTION_DAYS env var (default 7).
 */
@Injectable()
export class HistoryCleanupService {
  private readonly logger = new Logger(HistoryCleanupService.name);
  private readonly retentionDays: number;

  constructor(
    private readonly historyService: HistoryService,
    private readonly configService: ConfigService,
  ) {
    this.retentionDays = parseInt(
      this.configService.get<string>('HISTORY_RETENTION_DAYS') || '7',
      10,
    );
  }

  /**
   * Runs every day at 03:00 UTC.
   * Requires ScheduleModule.forRoot() in the root AppModule.
   */
  @Cron('0 3 * * *')
  async cleanup(): Promise<void> {
    this.logger.log(`History cleanup started (retention: ${this.retentionDays} days)`);

    const deleted = await this.historyService.deleteOlderThan(this.retentionDays);

    this.logger.log(`History cleanup done — ${deleted} row(s) deleted`);
  }
}
