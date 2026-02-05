import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from 'typeorm';

@Entity('device_status_history')
export class DeviceStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  @Index()
  deviceSn!: string;

  /** 'rest' = REST poll, 'mqtt' = MQTT push */
  @Column({ type: 'varchar' })
  source!: 'rest' | 'mqtt';

  @Column({ type: 'int' })
  batteryPercent!: number;

  @Column({ type: 'int' })
  inputWatts!: number;

  @Column({ type: 'int' })
  outputWatts!: number;

  @Column({ type: 'boolean' })
  gridConnected!: boolean;

  /** Full flat raw-properties object from EcoFlow, stored for future field extraction */
  @Column({ type: 'jsonb' })
  rawSnapshot!: Record<string, unknown>;

  /**
   * Wall-clock time of receipt — set explicitly at write time, NOT via
   * @CreateDateColumn, so MQTT messages that arrive with jitter still get
   * the correct timestamp.
   */
  @Column({ type: 'timestamptz' })
  @Index()
  recordedAt!: Date;
}
