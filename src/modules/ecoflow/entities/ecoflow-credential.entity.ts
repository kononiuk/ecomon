import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('ecoflow_credentials')
export class EcoFlowCredential {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  @Index()
  userId!: string;

  @ManyToOne(() => User)
  user!: User;

  @Column({ type: 'text' })
  encryptedAccessKey!: string;

  @Column({ type: 'text' })
  encryptedSecretKey!: string;

  @Column({ type: 'text' })
  iv!: string;

  @Column({ type: 'text' })
  authTag!: string;

  @Column({ type: 'text' })
  ivSecret!: string;

  @Column({ type: 'text' })
  authTagSecret!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'varchar', nullable: true })
  label!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
