import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../auth/entities/user.entity';
import { EcoflowService } from './ecoflow.service';
import { MonitorService } from './monitor.service';
import { HistoryService } from './history.service';
import { StoreCredentialsDto } from './dto/store-credentials.dto';
import { DeviceCommandDto } from './dto/device-command.dto';

@ApiTags('ecoflow')
@Controller('ecoflow')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class EcoflowController {
  constructor(
    private readonly ecoflowService: EcoflowService,
    private readonly monitorService: MonitorService,
    private readonly historyService: HistoryService,
  ) {}

  @Post('credentials')
  @ApiOperation({ summary: 'Store EcoFlow API credentials (encrypted)' })
  @ApiResponse({ status: 201, description: 'Credentials stored successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async storeCredentials(
    @CurrentUser() user: User,
    @Body() dto: StoreCredentialsDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    return this.ecoflowService.storeCredentials(
      user.id,
      dto,
      ipAddress,
      userAgent,
    );
  }

  @Delete('credentials')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete active EcoFlow credentials' })
  @ApiResponse({ status: 200, description: 'Credentials deleted successfully' })
  @ApiResponse({ status: 404, description: 'No active credentials found' })
  async deleteCredentials(@CurrentUser() user: User, @Req() req: Request) {
    const ipAddress = req.ip || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    return this.ecoflowService.deleteCredentials(user.id, ipAddress, userAgent);
  }

  @Get('devices')
  @ApiOperation({ summary: 'Get list of user EcoFlow devices' })
  @ApiResponse({ status: 200, description: 'Returns device list' })
  @ApiResponse({ status: 404, description: 'No credentials found' })
  async getDevices(@CurrentUser() user: User) {
    return this.ecoflowService.getDeviceList(user.id);
  }

  @Get('devices/:deviceSn/status')
  @ApiOperation({ summary: 'Get device status and quota information' })
  @ApiResponse({ status: 200, description: 'Returns device status' })
  @ApiResponse({
    status: 403,
    description: 'Device not found or access denied',
  })
  async getDeviceStatus(
    @CurrentUser() user: User,
    @Param('deviceSn') deviceSn: string,
    @Query('raw') raw?: string,
  ) {
    return this.ecoflowService.getDeviceQuota(user.id, deviceSn, raw === 'true');
  }

  @Post('devices/:deviceSn/command')
  @ApiOperation({ summary: 'Send command to EcoFlow device' })
  @ApiResponse({ status: 200, description: 'Command sent successfully' })
  @ApiResponse({
    status: 403,
    description: 'Device not found or access denied',
  })
  async sendCommand(
    @CurrentUser() user: User,
    @Param('deviceSn') deviceSn: string,
    @Body() dto: DeviceCommandDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    return this.ecoflowService.sendDeviceCommand(
      user.id,
      deviceSn,
      dto.params,
      ipAddress,
      userAgent,
    );
  }

  // ── monitor control ───────────────────────────────────────────────────────

  @Post('monitor/start')
  @ApiOperation({ summary: 'Start hybrid device monitoring (REST + MQTT)' })
  @ApiResponse({ status: 200, description: 'Monitor started or already running' })
  async monitorStart(
    @CurrentUser() user: User,
    @Body('devices') devices?: string[],
  ) {
    return this.monitorService.start(user.id, devices);
  }

  @Delete('monitor/stop')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stop device monitoring' })
  @ApiResponse({ status: 200, description: 'Monitor stopped or was not running' })
  async monitorStop(@CurrentUser() user: User) {
    return this.monitorService.stop(user.id);
  }

  @Get('monitor/status')
  @ApiOperation({ summary: 'Get current monitor state (running / stopped)' })
  @ApiResponse({ status: 200, description: 'MonitorState object or null' })
  async monitorStatus(@CurrentUser() user: User) {
    return this.monitorService.getStatus(user.id);
  }

  // ── history ───────────────────────────────────────────────────────────────

  @Get('monitor/history')
  @ApiOperation({ summary: 'Query device status history' })
  @ApiResponse({ status: 200, description: 'Array of DeviceStatusHistory rows' })
  async getHistory(
    @CurrentUser() user: User,
    @Query('deviceSn') deviceSn: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    // Validate that the user has active credentials (implicitly checks access)
    await this.ecoflowService.getDeviceList(user.id);

    return this.historyService.getHistory(
      deviceSn,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }
}
