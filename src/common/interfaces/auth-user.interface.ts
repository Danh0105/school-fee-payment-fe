import { Role } from '../enums/role.enum';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  schoolId: string | null;
  companyId: string | null;
}
