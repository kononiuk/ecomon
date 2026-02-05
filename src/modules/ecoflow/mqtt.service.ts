import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as mqtt from 'mqtt';
import { HistoryService } from './history.service';

export interface MqttCredentials {
  /** Full broker URL, e.g. "mqtts://mqtt-e.ecoflow.com:8883" */
  url: string;
  clientId: string;
  username: string;
  password: string;
}

@Injectable()
export class MqttService implements OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);

  private client: mqtt.MqttClient | null = null;
  private subscribedTopics: string[] = [];

  constructor(private readonly historyService: HistoryService) {}

  // ── connection ──────────────────────────────────────────────────────────────

  /**
   * Open a TLS connection to the EcoFlow MQTT broker.
   * Credentials are obtained externally by MonitorService (via RestClient).
   * Auto-reconnect is enabled at 5-second intervals.
   */
  async connect(creds: MqttCredentials): Promise<void> {
    if (this.client) {
      this.logger.warn('connect() called while already connected — disconnecting first');
      await this.disconnect();
    }

    this.client = mqtt.connect(creds.url, {
      clientId: creds.clientId,
      username: creds.username,
      password: creds.password,
      reconnectPeriod: 5_000,
      connectTimeout: 10_000,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('MQTT connect timeout (10 s)')),
        10_000,
      );

      this.client!.once('connect', () => {
        clearTimeout(timeout);
        this.logger.log('Connected to EcoFlow MQTT broker');
        resolve();
      });

      this.client!.once('error', (err: Error) => {
        clearTimeout(timeout);
        this.logger.error('MQTT connection error', err.message);
        reject(err);
      });
    });
  }

  // ── messaging ───────────────────────────────────────────────────────────────

  /**
   * Register the on-message handler.  Must be called once after connect().
   *
   * Topic layout:  /app/device/property/<SERIAL_NUMBER>
   * After split('/'): ['', 'app', 'device', 'property', '<SN>']  →  index 4
   *
   * The handler fires-and-forgets the DB write so the MQTT event loop is
   * never blocked.  Errors are caught and logged.
   */
  setupMessageHandler(): void {
    if (!this.client) throw new Error('MqttService: not connected');

    this.client.on('message', (topic: string, payload: Buffer) => {
      try {
        const deviceSn = topic.split('/')[4];
        if (!deviceSn) {
          this.logger.warn(`Unrecognised MQTT topic: ${topic}`);
          return;
        }

        const rawProps: Record<string, unknown> = JSON.parse(payload.toString());

        this.historyService
          .recordDataPoint({ deviceSn, source: 'mqtt', rawProps })
          .catch((err: Error) => {
            this.logger.error(
              `Failed to record MQTT data point for ${deviceSn}`,
              err.message,
            );
          });
      } catch (err) {
        this.logger.error('MQTT message parse error', (err as Error).message);
      }
    });
  }

  /**
   * Subscribe to the property topic for one device.
   */
  async subscribe(deviceSn: string): Promise<void> {
    if (!this.client) throw new Error('MqttService: not connected');

    const topic = `/app/device/property/${deviceSn}`;

    await new Promise<void>((resolve, reject) => {
      this.client!.subscribe(topic, (err) => {
        if (err) { reject(err); return; }
        this.subscribedTopics.push(topic);
        this.logger.log(`Subscribed to ${topic}`);
        resolve();
      });
    });
  }

  // ── teardown ────────────────────────────────────────────────────────────────

  /**
   * Gracefully disconnect.  removeAllListeners() first so the auto-reconnect
   * logic does not fire during an intentional shutdown.
   */
  async disconnect(): Promise<void> {
    if (!this.client) return;

    this.client.removeAllListeners();
    await this.client.endAsync();
    this.client = null;
    this.subscribedTopics = [];
    this.logger.log('Disconnected from EcoFlow MQTT broker');
  }

  /** True when there is an active, connected MQTT client */
  isConnected(): boolean {
    return this.client !== null && this.client.connected;
  }

  /** NestJS lifecycle hook — clean up on application shutdown */
  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }
}
