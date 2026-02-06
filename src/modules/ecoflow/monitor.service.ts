import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { RestClient } from '@ecoflow-api/rest-client';
import { EcoflowService } from './ecoflow.service';
import { HistoryService } from './history.service';
import { MonitorState } from './entities/monitor-state.entity';

@Injectable()
export class MonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitorService.name);

  // ── runtime state ───────────────────────────────────────────────────────────
  /** REST poll interval handle; null when not polling */
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  /** Which user's credentials are active */
  private activeUserId: string | null = null;
  /** Device serial numbers currently being polled */
  private activeDeviceSns: string[] = [];

  // ── env-driven config (read once at construction) ───────────────────────────
  private readonly pollIntervalMs: number;
  private readonly apiHost: string;

  constructor(
    @InjectRepository(MonitorState)
    private readonly monitorStateRepo: Repository<MonitorState>,
    private readonly ecoflowService: EcoflowService,
    private readonly historyService: HistoryService,
    private readonly configService: ConfigService,
  ) {
    this.pollIntervalMs = parseInt(
      this.configService.get<string>('ECOFLOW_POLL_INTERVAL') || '60000',
      10,
    );
    this.apiHost =
      this.configService.get<string>('ECOFLOW_API_HOST') ||
      'https://api-e.ecoflow.com';
  }

  // ── lifecycle ───────────────────────────────────────────────────────────────

  /**
   * Boot-time auto-resume (non-blocking).
   * Schedules monitor resume to run in background after server startup.
   */
  async onModuleInit(): Promise<void> {
    // Schedule resume to run AFTER server starts (non-blocking)
    void this.resumeActiveMonitors();
  }

  /**
   * Resume active monitors asynchronously (non-blocking).
   * Reads every MonitorState row that is flagged isRunning === true
   * and restarts the monitor for that user. If resumption fails the
   * row is flipped to stopped so a broken state does not retry on
   * every subsequent boot.
   *
   * Runs independently after server startup completes.
   */
  private async resumeActiveMonitors(): Promise<void> {
    try {
      const activeStates = await this.monitorStateRepo.find({
        where: { isRunning: true },
      });

      if (activeStates.length === 0) {
        return;
      }

      this.logger.log(`Found ${activeStates.length} active monitor(s) to resume`);

      for (const state of activeStates) {
        this.logger.log(`Resuming monitor for user ${state.userId} (persisted state)`);
        try {
          await this.startMonitoring(state.userId, state.devices);
        } catch (err) {
          this.logger.error(
            `Failed to auto-resume monitor for user ${state.userId}`,
            (err as Error).message,
          );
          // Mark as stopped on failure
          state.isRunning = false;
          state.stoppedAt = new Date();
          await this.monitorStateRepo.save(state);
        }
      }
    } catch (err) {
      this.logger.error('Error during monitor resume', (err as Error).message);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopPolling();
  }

  // ── public API (called by controller) ───────────────────────────────────────

  /**
   * Start monitoring for a user.  Persists isRunning=true and the optional
   * device-filter, then kicks off the REST poll loop and the MQTT connection.
   *
   * @param devices – if provided, only these SNs are monitored.
   *                  if omitted / undefined, every device on the account is monitored.
   */
  async start(
    userId: string,
    devices?: string[],
  ): Promise<{ message: string; startedAt: Date; devices: string[] | null }> {
    let state = await this.monitorStateRepo.findOne({ where: { userId } });

    if (!state) {
      state = this.monitorStateRepo.create({ userId, isRunning: false });
      state = await this.monitorStateRepo.save(state);
    }

    if (state.isRunning) {
      return {
        message: 'Monitor is already running',
        startedAt: state.startedAt!,
        devices: state.devices,
      };
    }

    state.isRunning = true;
    state.startedAt = new Date();
    state.stoppedAt = null;
    state.devices = devices && devices.length > 0 ? devices : null;
    await this.monitorStateRepo.save(state);

    await this.startMonitoring(userId, state.devices);

    return { message: 'Monitor started', startedAt: state.startedAt, devices: state.devices };
  }

  /**
   * Stop monitoring for a user.  Persists isRunning=false and tears down
   * both transports.
   */
  async stop(userId: string): Promise<{ message: string; stoppedAt: Date }> {
    const state = await this.monitorStateRepo.findOne({ where: { userId } });

    if (!state || !state.isRunning) {
      return {
        message: 'Monitor is not running',
        stoppedAt: state?.stoppedAt ?? new Date(),
      };
    }

    state.isRunning = false;
    state.stoppedAt = new Date();
    await this.monitorStateRepo.save(state);

    this.stopPolling();
    this.activeUserId = null;
    this.activeDeviceSns = [];

    return { message: 'Monitor stopped', stoppedAt: state.stoppedAt };
  }

  /**
   * Return the persisted monitor state for a user (or null if never started).
   */
  async getStatus(userId: string): Promise<MonitorState | null> {
    return this.monitorStateRepo.findOne({ where: { userId } });
  }

  // ── internal orchestration ──────────────────────────────────────────────────

  /**
   * Shared start logic — called by start() and by onModuleInit() on resume.
   * Does NOT touch the DB row (caller already persisted).
   *
   * @param filterSns – if non-null, only these SNs are polled.
   *                    if null, every device returned by the EcoFlow API is used.
   */
  private async startMonitoring(userId: string, filterSns: string[] | null = null): Promise<void> {
    this.activeUserId = userId;

    // 1. Discover which devices to monitor
    if (filterSns && filterSns.length > 0) {
      // Use the caller-supplied list directly — no round-trip to the cloud.
      this.activeDeviceSns = filterSns;
      this.logger.log(`Monitoring ${filterSns.length} selected device(s): ${filterSns.join(', ')}`);
    } else {
      // Default: fetch everything on the account.
      const devicesResponse = await this.ecoflowService.getDeviceList(userId);
      const devices: Array<{ sn: string }> = devicesResponse?.data ?? devicesResponse ?? [];
      this.activeDeviceSns = devices.map((d: { sn: string }) => d.sn);
    }

    if (this.activeDeviceSns.length === 0) {
      this.logger.warn('No devices found — monitor is running but idle');
    }

    // 2. REST poll loop
    this.startPolling(userId);
  }

  // ── REST polling ────────────────────────────────────────────────────────────

  private startPolling(userId: string): void {
    if (this.pollHandle) {
      this.logger.warn('startPolling: clearing previous interval');
      clearInterval(this.pollHandle);
    }

    // Fire once immediately, then on interval
    void this.pollOnce(userId);

    this.pollHandle = setInterval(() => {
      void this.pollOnce(userId);
    }, this.pollIntervalMs);

    this.logger.log(`REST poll loop started (${this.pollIntervalMs} ms)`);
  }

  private stopPolling(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
      this.logger.log('REST poll loop stopped');
    }
  }

  /**
   * Single poll tick — iterates every active device.  Per-device errors are
   * logged but do NOT kill the loop; the next tick will retry.
   */
  private async pollOnce(userId: string): Promise<void> {
    const creds = await this.ecoflowService.getActiveCredential(userId);
    const client = new RestClient({
      accessKey: creds.accessKey,
      secretKey: creds.secretKey,
      host: this.apiHost,
    });

    for (const sn of this.activeDeviceSns) {
      try {
        const response = await client.getDevicePropertiesPlain(sn);

        // Unwrap the SDK envelope — same logic as EcoflowService.getDeviceQuota
        const rawProps: Record<string, unknown> =
          (response as any)?.data ??
          (response as any)?.result?.result ??
          (response as any) ??
          {};

        await this.historyService.recordDataPoint({
          deviceSn: sn,
          source: 'rest',
          rawProps,
        });
      } catch (err) {
        this.logger.error(`REST poll failed for ${sn}`, (err as Error).message);
      }
    }
  }

}
