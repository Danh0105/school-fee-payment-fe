import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AccessControlService } from '../access-control/access-control.service';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    // A scoped ADMIN can only create users within their own reach: a school
    // they can access, or their own company. SUPER_ADMIN is unrestricted.
    if (actor.role !== Role.SUPER_ADMIN) {
      if (dto.schoolId) {
        await this.accessControlService.assertSchoolAccess(actor, dto.schoolId);
      }
      if (dto.companyId && dto.companyId !== actor.companyId) {
        throw AppException.forbidden(
          ErrorCode.FORBIDDEN,
          'Bạn không có quyền tạo tài khoản cho đơn vị quản lý khác',
        );
      }
    }

    const user = await this.usersService.create(dto);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      schoolId: user.schoolId,
      companyId: user.companyId,
    };
  }
}
