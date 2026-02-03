import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { RestClient } from '@ecoflow-api/rest-client';
import { EncryptionService } from '../../common/services/encryption.service';
import { AuditService } from '../audit/audit.service';
import { EcoFlowCredential } from './entities/ecoflow-credential.entity';
import { StoreCredentialsDto } from './dto/store-credentials.dto';

@Injectable()
export class EcoflowService {
  private readonly apiHost: string;

  constructor(
    @InjectRepository(EcoFlowCredential)
    private credentialRepository: Repository<EcoFlowCredential>,
    private encryptionService: EncryptionService,
    private auditService: AuditService,
    private configService: ConfigService,
  ) {
    this.apiHost =
      this.configService.get<string>('ECOFLOW_API_HOST') ||
      'https://api-e.ecoflow.com';
  }

  async storeCredentials(
    userId: string,
    dto: StoreCredentialsDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<{ id: string; message: string }> {
    const existingActive = await this.credentialRepository.findOne({
      where: { userId, isActive: true },
    });

    if (existingActive) {
      existingActive.isActive = false;
      await this.credentialRepository.save(existingActive);
    }

    const encryptedAccessKey = this.encryptionService.encrypt(dto.accessKey);
    const encryptedSecretKey = this.encryptionService.encrypt(dto.secretKey);

    const credential = this.credentialRepository.create({
      userId,
      encryptedAccessKey: encryptedAccessKey.encrypted,
      encryptedSecretKey: encryptedSecretKey.encrypted,
      iv: encryptedAccessKey.iv,
      authTag: encryptedAccessKey.authTag,
      ivSecret: encryptedSecretKey.iv,
      authTagSecret: encryptedSecretKey.authTag,
      label: dto.label || null,
      isActive: true,
    });

    const saved = await this.credentialRepository.save(credential);

    await this.auditService.log({
      userId,
      action: 'ecoflow.credentials.stored',
      resourceType: 'ecoflow_credential',
      resourceId: saved.id,
      metadata: { label: dto.label },
      ipAddress,
      userAgent,
      status: 'success',
    });

    return {
      id: saved.id,
      message: 'EcoFlow credentials stored successfully',
    };
  }

  async getActiveCredential(userId: string): Promise<{
    accessKey: string;
    secretKey: string;
  }> {
    const credential = await this.credentialRepository.findOne({
      where: { userId, isActive: true },
    });

    if (!credential) {
      throw new NotFoundException('No active EcoFlow credentials found');
    }

    const accessKey = this.encryptionService.decrypt(
      credential.encryptedAccessKey,
      credential.iv,
      credential.authTag,
    );
    const secretKey = this.encryptionService.decrypt(
      credential.encryptedSecretKey,
      credential.ivSecret,
      credential.authTagSecret,
    );

    return { accessKey, secretKey };
  }

  private async getApiClient(userId: string): Promise<RestClient> {
    const creds = await this.getActiveCredential(userId);

    return new RestClient({
      accessKey: creds.accessKey,
      secretKey: creds.secretKey,
      host: this.apiHost,
    });
  }

  async getDeviceList(userId: string): Promise<any> {
    const client = await this.getApiClient(userId);
    return client.getDevicesPlain();
  }

  async getDeviceQuota(
    userId: string,
    deviceSn: string,
  ): Promise<any> {
    await this.verifyDeviceOwnership(userId, deviceSn);
    const client = await this.getApiClient(userId);
    return client.getDevicePropertiesPlain(deviceSn);
  }

  async sendDeviceCommand(
    userId: string,
    deviceSn: string,
    params: Record<string, any>,
    ipAddress: string,
    userAgent: string,
  ): Promise<any> {
    await this.verifyDeviceOwnership(userId, deviceSn);

    const client = await this.getApiClient(userId);
    const result = await client.setCommandPlain({ sn: deviceSn, ...params });

    await this.auditService.log({
      userId,
      action: 'ecoflow.device.command',
      resourceType: 'ecoflow_device',
      resourceId: deviceSn,
      metadata: { params },
      ipAddress,
      userAgent,
      status: 'success',
    });

    return result;
  }

  private async verifyDeviceOwnership(
    userId: string,
    deviceSn: string,
  ): Promise<void> {
    const devices = await this.getDeviceList(userId);

    const deviceExists = devices.data?.some(
      (device: any) => device.sn === deviceSn,
    );

    if (!deviceExists) {
      throw new ForbiddenException(
        'Device not found or you do not have access to it',
      );
    }
  }

  async deleteCredentials(
    userId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<{ message: string }> {
    const credential = await this.credentialRepository.findOne({
      where: { userId, isActive: true },
    });

    if (!credential) {
      throw new NotFoundException('No active credentials found');
    }

    credential.isActive = false;
    await this.credentialRepository.save(credential);

    await this.auditService.log({
      userId,
      action: 'ecoflow.credentials.deleted',
      resourceType: 'ecoflow_credential',
      resourceId: credential.id,
      ipAddress,
      userAgent,
      status: 'success',
    });

    return { message: 'Credentials deleted successfully' };
  }
}
