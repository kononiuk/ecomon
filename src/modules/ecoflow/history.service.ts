import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan, Between } from 'typeorm';
import { DeviceStatusHistory } from './entities/device-status-history.entity';
import { DeviceUpdateEmitter } from './device-update.emitter';

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
    private readonly emitter: DeviceUpdateEmitter,
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

    const saved = await this.historyRepository.save(row);

    // Emit SSE event for real-time clients
    this.emitter.emitUpdate(saved);

    return saved;
  }

  // ── read ────────────────────────────────────────────────────────────────────
  /**
   * Query history for one device, optionally bounded by a time range.
   * Returns newest rows first, capped at `limit` (default 200).
   */
  async getHistory(
    deviceSn: string,
    from?: Date,
    to?: Date,
    limit: number = 200,
  ): Promise<DeviceStatusHistory[]> {
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
