import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
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
import { StoreCredentialsDto } from './dto/store-credentials.dto';
import { DeviceCommandDto } from './dto/device-command.dto';

@ApiTags('ecoflow')
@Controller('ecoflow')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class EcoflowController {
  constructor(private readonly ecoflowService: EcoflowService) {}

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
  ) {
    return this.ecoflowService.getDeviceQuota(user.id, deviceSn);
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
}
