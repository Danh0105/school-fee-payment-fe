import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// The global JwtAuthGuard only ever validates the 'jwt' (staff) strategy, so
// parent-portal routes are marked @Public() to skip it and rely solely on
// this guard for the 'jwt-parent' strategy instead.
@Injectable()
export class ParentJwtAuthGuard extends AuthGuard('jwt-parent') {}
