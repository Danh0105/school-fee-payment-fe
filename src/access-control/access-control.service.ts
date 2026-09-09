import { Injectable } from '@nestjs/common';
import { SchoolsService } from '../schools/schools.service';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { Role } from '../common/enums/role.enum';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

/**
 * Central authority for "which schools can this user touch". A user is
 * scoped exactly one of three ways:
 *  - SUPER_ADMIN: unrestricted, platform-wide.
 *  - companyId set: every school under that company (a back-office
 *    accounting team managing several schools for the same operator).
 *  - schoolId set: exactly that one school (a school's own local staff).
 * An ADMIN with neither set keeps the legacy "cross-school admin"
 * behaviour; any other role with neither set is denied by default rather
 * than silently seeing every school in the database.
 */
@Injectable()
export class AccessControlService {
  constructor(private readonly schoolsService: SchoolsService) {}

  async canAccessSchool(user: AuthUser, schoolId: string): Promise<boolean> {
    if (user.role === Role.SUPER_ADMIN) return true;
    if (user.companyId) {
      const school = await this.schoolsService.findById(schoolId);
      return school.companyId === user.companyId;
    }
    if (user.schoolId) return user.schoolId === schoolId;
    return user.role === Role.ADMIN;
  }

  async assertSchoolAccess(user: AuthUser, schoolId: string): Promise<void> {
    const allowed = await this.canAccessSchool(user, schoolId);
    if (!allowed) {
      throw AppException.forbidden(ErrorCode.SCHOOL_OUT_OF_SCOPE);
    }
  }

  /**
   * Resolves the set of schools a user may see when no explicit schoolId
   * filter was supplied. `null` means unrestricted (do not filter).
   * An empty array means the account has no usable scope — callers must
   * treat that as "return nothing" rather than skip the filter.
   */
  async getAccessibleSchoolIds(user: AuthUser): Promise<string[] | null> {
    if (user.role === Role.SUPER_ADMIN) return null;
    if (user.companyId)
      return this.schoolsService.findIdsByCompany(user.companyId);
    if (user.schoolId) return [user.schoolId];
    if (user.role === Role.ADMIN) return null;
    return [];
  }

  /**
   * Validates an explicit schoolId filter if present, otherwise returns the
   * accessible-school list to apply as a filter. Convenience wrapper for the
   * common controller pattern: "filter list by schoolId if given, else
   * restrict to what this user can see".
   */
  async resolveSchoolFilter(
    user: AuthUser,
    requestedSchoolId?: string | null,
  ): Promise<string[] | null> {
    if (requestedSchoolId) {
      await this.assertSchoolAccess(user, requestedSchoolId);
      return [requestedSchoolId];
    }
    return this.getAccessibleSchoolIds(user);
  }
}
