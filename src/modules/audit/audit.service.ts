import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export interface AuditLogData {
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  status?: 'success' | 'failure';
  errorMessage?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  async log(data: AuditLogData): Promise<void> {
    const auditLog = this.auditLogRepository.create({
      userId: data.userId || null,
      action: data.action,
      resourceType: data.resourceType || null,
      resourceId: data.resourceId || null,
      metadata: data.metadata || null,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
      status: data.status || 'success',
      errorMessage: data.errorMessage || null,
    });

    await this.auditLogRepository.save(auditLog);
  }

  async getUserLogs(userId: string, limit = 100): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getResourceLogs(
    resourceType: string,
    resourceId: string,
    limit = 100,
  ): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { resourceType, resourceId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
