import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { EntityStatus } from '../common/enums/status.enum';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { User } from '../users/entities/user.entity';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw AppException.unauthorized(ErrorCode.INVALID_CREDENTIALS);
    }
    if (user.status !== EntityStatus.ACTIVE) {
      throw AppException.unauthorized(ErrorCode.USER_INACTIVE);
    }
    const isValid = await this.usersService.validatePassword(user, password);
    if (!isValid) {
      throw AppException.unauthorized(ErrorCode.INVALID_CREDENTIALS);
    }
    return user;
  }

  async login(user: User): Promise<TokenPair> {
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw AppException.unauthorized(ErrorCode.INVALID_REFRESH_TOKEN);
    }

    const user = await this.usersService.findByEmail(payload.email);
    if (!user || !user.refreshTokenHash) {
      throw AppException.unauthorized(ErrorCode.INVALID_REFRESH_TOKEN);
    }
    if (user.status !== EntityStatus.ACTIVE) {
      throw AppException.unauthorized(ErrorCode.USER_INACTIVE);
    }
    const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!matches) {
      throw AppException.unauthorized(ErrorCode.INVALID_REFRESH_TOKEN);
    }

    return this.issueTokens(user);
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.setRefreshTokenHash(userId, null);
  }

  private async issueTokens(user: User): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
    };

    const expiresIn = this.config.get<string>('jwt.expiresIn')!;
    const refreshExpiresIn = this.config.get<string>('jwt.refreshExpiresIn')!;

    const accessToken = await this.jwtService.signAsync(payload as unknown as Record<string, unknown>, {
      secret: this.config.get<string>('jwt.secret'),
      expiresIn: expiresIn as JwtSignOptions['expiresIn'],
    });
    const refreshToken = await this.jwtService.signAsync(payload as unknown as Record<string, unknown>, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: refreshExpiresIn as JwtSignOptions['expiresIn'],
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.usersService.setRefreshTokenHash(user.id, refreshTokenHash);

    return { accessToken, refreshToken, expiresIn };
  }
}
