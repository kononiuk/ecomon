import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

/**
 * One row per user.  Persists the running/stopped state of the hybrid monitor
 * so that it survives application restarts.  MonitorService.onModuleInit()
 * reads this table on boot and auto-resumes any row where isRunning === true.
 */
@Entity('monitor_state')
export class MonitorState {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  @Index()
  userId!: string;

  @ManyToOne(() => User)
  user!: User;

  @Column({ type: 'boolean', default: false })
  isRunning!: boolean;

  /**
   * Subset of device serial numbers to monitor.
   * null  → monitor ALL devices on the account.
   * array → monitor only the listed SNs.
   * Persisted so that boot-time auto-resume honours the original selection.
   */
  @Column({ type: 'jsonb', nullable: true })
  devices!: string[] | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  stoppedAt!: Date | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
