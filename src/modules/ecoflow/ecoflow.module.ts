import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EcoflowService } from './ecoflow.service';
import { EcoflowController } from './ecoflow.controller';
import { DeviceStatusService } from './device-status.service';
import { HistoryService } from './history.service';
import { MqttService } from './mqtt.service';
import { MonitorService } from './monitor.service';
import { HistoryCleanupService } from './history-cleanup.service';
import { EcoFlowCredential } from './entities/ecoflow-credential.entity';
import { DeviceStatusHistory } from './entities/device-status-history.entity';
import { MonitorState } from './entities/monitor-state.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EcoFlowCredential,
      DeviceStatusHistory,
      MonitorState,
    ]),
    AuthModule,
  ],
  controllers: [EcoflowController],
  providers: [
    EcoflowService,
    DeviceStatusService,
    HistoryService,
    MqttService,
    MonitorService,
    HistoryCleanupService,
  ],
  exports: [EcoflowService],
})
export class EcoflowModule {}
