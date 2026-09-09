import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CanActivate } from '@nestjs/common';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import { AuthUser } from '../interfaces/auth-user.interface';
import { AppException } from '../exceptions/app.exception';
import { ErrorCode } from '../constants/error-codes';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user: AuthUser }>();
    const user = request.user;
    if (!user || !requiredRoles.includes(user.role)) {
      throw AppException.forbidden(ErrorCode.FORBIDDEN);
    }
    return true;
  }
}
