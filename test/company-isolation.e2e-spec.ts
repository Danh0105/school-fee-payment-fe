import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { CompaniesService } from '../src/companies/companies.service';
import { SchoolsService } from '../src/schools/schools.service';
import { UsersService } from '../src/users/users.service';
import { StudentsService } from '../src/students/students.service';
import { AccessControlService } from '../src/access-control/access-control.service';
import { Role } from '../src/common/enums/role.enum';
import type { AuthUser } from '../src/common/interfaces/auth-user.interface';

describe('Company-based tenant isolation (e2e)', () => {
  let app: INestApplication;
  let companiesService: CompaniesService;
  let schoolsService: SchoolsService;
  let usersService: UsersService;
  let studentsService: StudentsService;
  let accessControlService: AccessControlService;

  const runId = Date.now().toString(36);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    companiesService = app.get(CompaniesService);
    schoolsService = app.get(SchoolsService);
    usersService = app.get(UsersService);
    studentsService = app.get(StudentsService);
    accessControlService = app.get(AccessControlService);
  });

  afterAll(async () => {
    await app.close();
  });

  it("a company-scoped accountant can reach every school under their own company but not a rival company's school", async () => {
    const companyA = await companiesService.create({
      code: `CO-A-${runId}`,
      name: 'Công ty A',
    });
    const companyB = await companiesService.create({
      code: `CO-B-${runId}`,
      name: 'Công ty B',
    });

    const schoolA1 = await schoolsService.create({
      companyId: companyA.id,
      code: `SCH-A1-${runId}`,
      name: 'Trường A1',
    });
    const schoolA2 = await schoolsService.create({
      companyId: companyA.id,
      code: `SCH-A2-${runId}`,
      name: 'Trường A2',
    });
    const schoolB1 = await schoolsService.create({
      companyId: companyB.id,
      code: `SCH-B1-${runId}`,
      name: 'Trường B1',
    });

    const accountantA = await usersService.create({
      email: `acct-a-${runId}@test.local`,
      password: 'Test@123456',
      fullName: 'Kế toán công ty A',
      role: Role.ACCOUNTANT,
      companyId: companyA.id,
    });

    const actorA: AuthUser = {
      id: accountantA.id,
      email: accountantA.email,
      role: Role.ACCOUNTANT,
      schoolId: null,
      companyId: companyA.id,
    };

    // Reaches both of the company's own schools.
    await expect(
      accessControlService.assertSchoolAccess(actorA, schoolA1.id),
    ).resolves.toBeUndefined();
    await expect(
      accessControlService.assertSchoolAccess(actorA, schoolA2.id),
    ).resolves.toBeUndefined();

    // Cannot reach a school under a different company.
    await expect(
      accessControlService.assertSchoolAccess(actorA, schoolB1.id),
    ).rejects.toThrow();

    // Unscoped list resolves to exactly the company's own schools.
    const accessibleIds =
      await accessControlService.getAccessibleSchoolIds(actorA);
    expect(accessibleIds).not.toBeNull();
    expect(new Set(accessibleIds)).toEqual(new Set([schoolA1.id, schoolA2.id]));
  });

  it('a single-school-scoped accountant cannot reach a sibling school in the same company', async () => {
    const company = await companiesService.create({
      code: `CO-C-${runId}`,
      name: 'Công ty C',
    });
    const schoolC1 = await schoolsService.create({
      companyId: company.id,
      code: `SCH-C1-${runId}`,
      name: 'Trường C1',
    });
    const schoolC2 = await schoolsService.create({
      companyId: company.id,
      code: `SCH-C2-${runId}`,
      name: 'Trường C2',
    });

    const localAdmin = await usersService.create({
      email: `local-c1-${runId}@test.local`,
      password: 'Test@123456',
      fullName: 'Kế toán riêng trường C1',
      role: Role.ACCOUNTANT,
      schoolId: schoolC1.id,
    });

    const actor: AuthUser = {
      id: localAdmin.id,
      email: localAdmin.email,
      role: Role.ACCOUNTANT,
      schoolId: schoolC1.id,
      companyId: null,
    };

    await expect(
      accessControlService.assertSchoolAccess(actor, schoolC1.id),
    ).resolves.toBeUndefined();
    await expect(
      accessControlService.assertSchoolAccess(actor, schoolC2.id),
    ).rejects.toThrow();
  });

  it("a company-scoped accountant only sees students from their own company's schools", async () => {
    const companyD = await companiesService.create({
      code: `CO-D-${runId}`,
      name: 'Công ty D',
    });
    const companyE = await companiesService.create({
      code: `CO-E-${runId}`,
      name: 'Công ty E',
    });
    const schoolD = await schoolsService.create({
      companyId: companyD.id,
      code: `SCH-D-${runId}`,
      name: 'Trường D',
    });
    const schoolE = await schoolsService.create({
      companyId: companyE.id,
      code: `SCH-E-${runId}`,
      name: 'Trường E',
    });

    const studentD = await studentsService.create({
      schoolId: schoolD.id,
      fullName: `HS Trường D ${runId}`,
    });
    const studentE = await studentsService.create({
      schoolId: schoolE.id,
      fullName: `HS Trường E ${runId}`,
    });

    const accountantD = await usersService.create({
      email: `acct-d-${runId}@test.local`,
      password: 'Test@123456',
      fullName: 'Kế toán công ty D',
      role: Role.ACCOUNTANT,
      companyId: companyD.id,
    });
    const actorD: AuthUser = {
      id: accountantD.id,
      email: accountantD.email,
      role: Role.ACCOUNTANT,
      schoolId: null,
      companyId: companyD.id,
    };

    const scopedIds = await accessControlService.getAccessibleSchoolIds(actorD);
    const result = await studentsService.findAll(
      { page: 1, limit: 50, skip: 0 },
      scopedIds,
    );
    const returnedIds = result.data.map((s) => s.id);

    expect(returnedIds).toContain(studentD.id);
    expect(returnedIds).not.toContain(studentE.id);
  });
});
