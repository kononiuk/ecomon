import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto): Promise<{ user: User }> {
    // Count how many users exist. First user → admin. Any after that → blocked.
    const userCount = await this.userRepository.count();

    if (userCount > 0) {
      throw new ForbiddenException('Registration is closed. This is a single-owner application.');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 12);

    const user = this.userRepository.create({
      email: registerDto.email,
      password: hashedPassword,
      role: 'admin',   // first (and only) user is always admin
    });

    await this.userRepository.save(user);

    const { password, ...userWithoutPassword } = user;

    return { user: userWithoutPassword as User };
  }

  async login(
    loginDto: LoginDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const user = await this.validateUser(loginDto.email, loginDto.password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(
      user,
      ipAddress,
      userAgent,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
    };
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user || !user.isActive) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  private generateAccessToken(user: User): string {
    const payload = { sub: user.id, email: user.email };
    const options: JwtSignOptions = {
      secret: this.configService.get<string>('JWT_SECRET') || '',
      expiresIn: (this.configService.get<string>('JWT_EXPIRATION') || '15m') as StringValue,
    };
    return this.jwtService.sign(payload, options);
  }

  private async generateRefreshToken(
    user: User,
    ipAddress: string,
    userAgent: string,
  ): Promise<string> {
    const token = crypto.randomBytes(64).toString('hex');
    const hashedToken = await bcrypt.hash(token, 10);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const refreshToken = this.refreshTokenRepository.create({
      userId: user.id,
      token: hashedToken,
      expiresAt,
      ipAddress,
      userAgent,
    });

    await this.refreshTokenRepository.save(refreshToken);

    return token;
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Verify current password
    const isCurrentValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash and save new password
    user.password = await bcrypt.hash(dto.newPassword, 12);
    await this.userRepository.save(user);

    // Revoke ALL refresh tokens — forces re-login on every session
    await this.refreshTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true, revokedAt: new Date() },
    );

    return { message: 'Password changed. All sessions have been revoked.' };
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const tokens = await this.refreshTokenRepository.find({
      where: { userId, isRevoked: false },
    });

    for (const token of tokens) {
      const isMatch = await bcrypt.compare(refreshToken, token.token);
      if (isMatch) {
        token.isRevoked = true;
        token.revokedAt = new Date();
        await this.refreshTokenRepository.save(token);
        return;
      }
    }

    throw new UnauthorizedException('Invalid refresh token');
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokens = await this.refreshTokenRepository.find({
      where: { isRevoked: false },
      relations: ['user'],
    });

    let validToken: RefreshToken | null = null;

    for (const token of tokens) {
      const isMatch = await bcrypt.compare(refreshToken, token.token);
      if (isMatch) {
        validToken = token;
        break;
      }
    }

    if (!validToken || validToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    validToken.isRevoked = true;
    validToken.revokedAt = new Date();
    await this.refreshTokenRepository.save(validToken);

    const user = validToken.user;
    const newAccessToken = this.generateAccessToken(user);
    const newRefreshToken = await this.generateRefreshToken(
      user,
      validToken.ipAddress || '',
      validToken.userAgent || '',
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }
}
