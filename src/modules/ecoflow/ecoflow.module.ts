import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EcoflowService } from './ecoflow.service';
import { EcoflowController } from './ecoflow.controller';
import { EcoFlowCredential } from './entities/ecoflow-credential.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([EcoFlowCredential]), AuthModule],
  controllers: [EcoflowController],
  providers: [EcoflowService],
  exports: [EcoflowService],
})
export class EcoflowModule {}
