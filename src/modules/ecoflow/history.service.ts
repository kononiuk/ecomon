import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan, Between } from 'typeorm';
import { DeviceStatusHistory } from './entities/device-status-history.entity';

export interface DataPoint {
  deviceSn: string;
  source: 'rest' | 'mqtt';
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
   * Pull the four scalar fields out of the raw-properties object.
   * Handles two shapes transparently:
   *
   * 1. REST quota (flat, literal-dot keys):
   *      { "pd.soc": 100, "pd.wattsInSum": 61, … }
   *
   * 2. MQTT Open-IoT module packet (nested params):
   *      { typeCode: "pdStatus", params: { soc: 100, wattsInSum: 61, … } }
   *      { typeCode: "bmsStatus", params: { soc: 100, … } }
   *      Other typeCodes (mpptStatus, invStatus) don't carry these fields —
   *      the scalars correctly fall through to 0 / false for those packets.
   *
   * Key paths are kept in sync with DeviceStatusService's FIELD_EXTRACTORS.
   */
  private extractFields(rawProps: Record<string, unknown>): {
    batteryPercent: number;
    inputWatts: number;
    outputWatts: number;
    gridConnected: boolean;
  } {
    // If this is an MQTT module packet, pull params out; otherwise use the
    // top-level object directly (REST flat format).
    const params =
      typeof rawProps['params'] === 'object' && rawProps['params'] !== null
        ? (rawProps['params'] as Record<string, unknown>)
        : null;

    return {
      batteryPercent: Number(
        rawProps['pd.soc'] ??
          rawProps['bms_bmsStatus.soc'] ??
          params?.['soc'] ??
          0,
      ),
      inputWatts: Number(
        rawProps['pd.wattsInSum'] ??
          rawProps['inv.inputWatts'] ??
          params?.['wattsInSum'] ??
          0,
      ),
      outputWatts: Number(
        rawProps['pd.wattsOutSum'] ??
          rawProps['inv.outputWatts'] ??
          params?.['wattsOutSum'] ??
          0,
      ),
      gridConnected:
        rawProps['bms_emsStatus.chgLinePlug'] === 1 ||
        params?.['chgLinePlug'] === 1,
    };
  }

  // ── deduplication ───────────────────────────────────────────────────────────
  /**
   * Returns true when inserting this point would be a duplicate.
   *
   * REST  – any row with the same deviceSn in the last 2 s.
   * MQTT  – any row with the same deviceSn AND same typeCode in the last 2 s.
   *         Different module packets (bmsStatus, mpptStatus, …) are never
   *         considered duplicates of each other.
   */
  private async isDuplicatePoint(
    point: DataPoint,
    since: Date,
  ): Promise<boolean> {
    if (point.source === 'rest') {
      // REST: simple check — any row (any source) for this device in 2 s.
      const row = await this.historyRepository.findOne({
        where: {
          deviceSn: point.deviceSn,
          source: 'rest',
          recordedAt: MoreThan(since),
        },
        order: { recordedAt: 'DESC' },
      });
      return row !== null;
    }

    // MQTT: only dedup against rows with the same typeCode.
    const typeCode =
      typeof point.rawProps['typeCode'] === 'string'
        ? point.rawProps['typeCode']
        : null;

    if (!typeCode) {
      // No typeCode in the packet — fall back to source-only dedup.
      const row = await this.historyRepository.findOne({
        where: {
          deviceSn: point.deviceSn,
          source: 'mqtt',
          recordedAt: MoreThan(since),
        },
        order: { recordedAt: 'DESC' },
      });
      return row !== null;
    }

    // Match on deviceSn + source='mqtt' + rawSnapshot->>'typeCode' + time window.
    const count = await this.historyRepository
      .createQueryBuilder('h')
      .where('h."deviceSn" = :sn', { sn: point.deviceSn })
      .andWhere('h.source = :src', { src: 'mqtt' })
      .andWhere("h.\"rawSnapshot\"->>'typeCode' = :tc", { tc: typeCode })
      .andWhere('h."recordedAt" > :since', { since })
      .getCount();

    return count > 0;
  }

  // ── write ───────────────────────────────────────────────────────────────────
  /**
   * Persist one history row.  Returns null when the insert is skipped by the
   * deduplication guard.
   *
   * Dedup rules (SQL-level, survives restarts):
   *   REST  – skip if another REST row for the same deviceSn exists within 2 s.
   *   MQTT  – skip if another MQTT row with the same deviceSn AND the same
   *           typeCode exists within 2 s.  Different module packets (e.g.
   *           bmsStatus vs mpptStatus) are distinct data and are never deduped
   *           against each other.
   */
  async recordDataPoint(point: DataPoint): Promise<DeviceStatusHistory | null> {
    const twoSecondsAgo = new Date(Date.now() - 2_000);

    const isDuplicate = await this.isDuplicatePoint(point, twoSecondsAgo);
    if (isDuplicate) {
      const tc =
        typeof point.rawProps['typeCode'] === 'string'
          ? ` [${point.rawProps['typeCode']}]`
          : '';
      this.logger.debug(
        `Dedup: skipping ${point.source}${tc} point for ${point.deviceSn}`,
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
