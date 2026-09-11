import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ParentAuthUser } from '../interfaces/parent-auth-user.interface';

// Only valid on routes guarded by ParentJwtAuthGuard — that guard's Passport
// strategy is what populates request.user with a ParentAuthUser shape.
export const CurrentParent = createParamDecorator(
  (data: keyof ParentAuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: ParentAuthUser }>();
    return data ? request.user?.[data] : request.user;
  },
);
