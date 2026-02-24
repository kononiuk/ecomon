import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan, Between } from 'typeorm';
import { DeviceStatusHistory } from './entities/device-status-history.entity';
import {
  HistoryPeriod,
  PERIOD_MS,
} from './dto/get-history-query.dto';

export interface DataPoint {
  deviceSn: string;
  source: 'rest';
  /** The flat raw-properties object from EcoFlow (literal-dot keys like "pd.soc") */
  rawProps: Record<string, unknown>;
}

@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  constructor(
    @InjectRepository(DeviceStatusHistory)
    private readonly historyRepository: Repository<DeviceStatusHistory>,
  ) {}

  // ── field extraction ────────────────────────────────────────────────────────
  /**
   * Pull the four scalar fields out of the flat raw-properties object.
   * Key paths are kept in sync with DeviceStatusService's FIELD_EXTRACTORS.
   * Raw keys contain literal dots — bracket notation only.
   */
  private extractFields(rawProps: Record<string, unknown>): {
    batteryPercent: number;
    inputWatts: number;
    outputWatts: number;
    gridConnected: boolean;
  } {
    return {
      batteryPercent: Number(
        rawProps['pd.soc'] ?? rawProps['bms_bmsStatus.soc'] ?? 0,
      ),
      inputWatts: Number(
        rawProps['pd.wattsInSum'] ?? rawProps['inv.inputWatts'] ?? 0,
      ),
      outputWatts: Number(
        rawProps['pd.wattsOutSum'] ?? rawProps['inv.outputWatts'] ?? 0,
      ),
      gridConnected: rawProps['bms_emsStatus.chgLinePlug'] === 1,
    };
  }

  // ── write ───────────────────────────────────────────────────────────────────
  /**
   * Persist one history row.  Returns null when the insert is skipped because
   * a row for the same deviceSn already exists within the last 2 seconds
   * (deduplication guard — survives restarts).
   */
  async recordDataPoint(point: DataPoint): Promise<DeviceStatusHistory | null> {
    const twoSecondsAgo = new Date(Date.now() - 2_000);

    const recent = await this.historyRepository.findOne({
      where: {
        deviceSn: point.deviceSn,
        recordedAt: MoreThan(twoSecondsAgo),
      },
      order: { recordedAt: 'DESC' },
    });

    if (recent) {
      this.logger.debug(
        `Dedup: skipping ${point.source} point for ${point.deviceSn}`,
      );
      return null;
    }

    const fields = this.extractFields(point.rawProps);

    const row = this.historyRepository.create({
      deviceSn: point.deviceSn,
      source: point.source,
      batteryPercent: fields.batteryPercent,
      inputWatts: fields.inputWatts,
      outputWatts: fields.outputWatts,
      gridConnected: fields.gridConnected,
      rawSnapshot: point.rawProps,
      recordedAt: new Date(),
    });

    return this.historyRepository.save(row);
  }

  // ── read ────────────────────────────────────────────────────────────────────
  /**
   * Query history for one device with flexible time-range selection.
   *
   * Priority:
   *   1. `period` shorthand  → resolves to [now - periodMs, now]   (ignores from/to)
   *   2. `from` + `to`       → explicit closed range
   *   3. `from` only         → open-ended from that point forward
   *   4. `to` only           → everything up to that point
   *   5. neither             → all rows for the device
   *
   * Returns newest rows first, capped at `limit` (default 1000, max 5000).
   */
  async getHistory(
    deviceSn: string,
    options: {
      period?: HistoryPeriod;
      from?: Date;
      to?: Date;
      limit?: number;
    } = {},
  ): Promise<DeviceStatusHistory[]> {
    const { period, limit = 1000 } = options;
    let { from, to } = options;

    // Period shorthand overrides explicit from/to
    if (period) {
      to = new Date();
      from = new Date(Date.now() - PERIOD_MS[period]);
    }

    const where: Record<string, unknown> = { deviceSn };

    if (from && to) {
      where.recordedAt = Between(from, to);
    } else if (from) {
      where.recordedAt = MoreThan(from);
    } else if (to) {
      where.recordedAt = LessThan(to);
    }

    return this.historyRepository.find({
      where: where as any,
      order: { recordedAt: 'DESC' },
      take: limit,
    });
  }

  // ── cleanup ─────────────────────────────────────────────────────────────────
  /**
   * Delete all history rows older than `retentionDays`.
   * Uses a single DELETE query (no entity hydration) for efficiency.
   * Returns the number of rows deleted.
   */
  async deleteOlderThan(retentionDays: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const result = await this.historyRepository
      .createQueryBuilder('h')
      .where('h."recordedAt" < :cutoff', { cutoff })
      .delete()
      .execute();

    return result.affected ?? 0;
  }
}
