import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  user!: User | null;

  @Column({ type: 'varchar' })
  action!: string;

  @Column({ type: 'varchar', nullable: true })
  resourceType!: string | null;

  @Column({ type: 'varchar', nullable: true })
  resourceId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @Column({ type: 'varchar', nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'varchar', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'varchar', default: 'success' })
  status!: 'success' | 'failure';

  @Column({ type: 'varchar', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn()
  @Index()
  createdAt!: Date;
}
