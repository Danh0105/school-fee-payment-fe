import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ParentJwtPayload } from '../interfaces/parent-jwt-payload.interface';
import { ParentAuthUser } from '../interfaces/parent-auth-user.interface';

// Registered under a distinct Passport strategy name ('jwt-parent') so it
// never collides with the staff strategy ('jwt') — a parent token must only
// ever validate against parent-portal routes, and vice versa.
@Injectable()
export class ParentJwtStrategy extends PassportStrategy(
  Strategy,
  'jwt-parent',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('parentJwt.secret')!,
    });
  }

  validate(payload: ParentJwtPayload): ParentAuthUser {
    return { studentId: payload.studentId };
  }
}
