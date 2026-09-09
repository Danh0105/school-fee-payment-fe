import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { CompaniesService } from '../../companies/companies.service';
import { SchoolsService } from '../../schools/schools.service';
import { UsersService } from '../../users/users.service';
import { AcademicYearsService } from '../../academic-years/academic-years.service';
import { ClassesService } from '../../classes/classes.service';
import { StudentsService } from '../../students/students.service';
import { StudentClassesService } from '../../student-classes/student-classes.service';
import { FeeCategoriesService } from '../../fee-categories/fee-categories.service';
import { FeePlansService } from '../../fee-plans/fee-plans.service';
import { Company } from '../../companies/entities/company.entity';
import { School } from '../../schools/entities/school.entity';
import { AcademicYear } from '../../academic-years/entities/academic-year.entity';
import { FeeCategory } from '../../fee-categories/entities/fee-category.entity';
import { FeePlan } from '../../fee-plans/entities/fee-plan.entity';
import { Role } from '../../common/enums/role.enum';
import {
  AcademicYearStatus,
  BillingType,
  FeePlanStatus,
} from '../../common/enums/status.enum';

const logger = new Logger('Seed');

// VietinBank's NAPAS/VietQR bank BIN — see https://www.napas.com.vn (Ngân
// hàng TMCP Công Thương Việt Nam). Any school's bankCode can point at any
// participating bank; VietinBank is used here as the seed's example.
const VIETINBANK_BIN = '970415';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const companiesService = app.get(CompaniesService);
    const schoolsService = app.get(SchoolsService);
    const usersService = app.get(UsersService);
    const academicYearsService = app.get(AcademicYearsService);
    const classesService = app.get(ClassesService);
    const studentsService = app.get(StudentsService);
    const studentClassesService = app.get(StudentClassesService);
    const feeCategoriesService = app.get(FeeCategoriesService);
    const feePlansService = app.get(FeePlansService);

    logger.log('Seeding managing company...');
    let company: Company;
    const existingCompanies = await companiesService.findAll({
      page: 1,
      limit: 1,
      search: 'EDUACC',
      skip: 0,
    });
    if (existingCompanies.data.length > 0) {
      company = existingCompanies.data[0];
    } else {
      company = await companiesService.create({
        code: 'EDUACC',
        name: 'Công ty Dịch vụ Kế toán Giáo dục ABC',
        contactEmail: 'ketoan@eduacc.vn',
      });
    }
    logger.log(`Company: ${company.code} (${company.id})`);

    logger.log('Seeding schools (both managed by the same company)...');
    let school: School;
    const existingSchools = await schoolsService.findAll({
      page: 1,
      limit: 1,
      search: 'KIMDONG',
      skip: 0,
    });
    if (existingSchools.data.length > 0) {
      school = existingSchools.data[0];
      if (school.companyId !== company.id) {
        school = await schoolsService.update(school.id, {
          companyId: company.id,
        });
      }
    } else {
      school = await schoolsService.create({
        companyId: company.id,
        code: 'KIMDONG',
        name: 'Trường Tiểu Học Kim Đồng',
        address: '123 Đường Kim Đồng, Quận 1, TP.HCM',
        bankName: 'Ngân hàng TMCP Công Thương Việt Nam (VietinBank)',
        bankCode: VIETINBANK_BIN,
        bankAccountNumber: '0123456789',
        bankAccountName: 'TRUONG TIEU HOC KIM DONG',
      });
    }
    logger.log(`School: ${school.code} (${school.id})`);

    let school2: School;
    const existingSchool2 = await schoolsService.findAll({
      page: 1,
      limit: 1,
      search: 'LEVANTAM',
      skip: 0,
    });
    if (existingSchool2.data.length > 0) {
      school2 = existingSchool2.data[0];
      if (school2.companyId !== company.id) {
        school2 = await schoolsService.update(school2.id, {
          companyId: company.id,
        });
      }
    } else {
      school2 = await schoolsService.create({
        companyId: company.id,
        code: 'LEVANTAM',
        name: 'Trường Tiểu Học Lê Văn Tám',
        address: '45 Đường Lê Văn Tám, Quận 1, TP.HCM',
        bankName: 'Ngân hàng TMCP Công Thương Việt Nam (VietinBank)',
        bankCode: VIETINBANK_BIN,
        bankAccountNumber: '0129998888',
        bankAccountName: 'TRUONG TIEU HOC LE VAN TAM',
      });
    }
    logger.log(
      `School: ${school2.code} (${school2.id}) — seeded only to demonstrate cross-school company scoping`,
    );

    logger.log('Seeding super admin user...');
    let admin = await usersService.findByEmail('admin@kimdong.edu.vn');
    if (!admin) {
      admin = await usersService.create({
        email: 'admin@kimdong.edu.vn',
        password: 'Admin@123456',
        fullName: 'Quản trị viên hệ thống',
        role: Role.SUPER_ADMIN,
      });
    }

    // The accountant/cashier belong to the COMPANY, not a single school —
    // they can act on any school that company manages (KIMDONG and
    // LEVANTAM here), per AccessControlService.
    let accountant = await usersService.findByEmail('ketoan@eduacc.vn');
    if (!accountant) {
      accountant = await usersService.create({
        email: 'ketoan@eduacc.vn',
        password: 'KeToan@123456',
        fullName: 'Kế toán công ty (quản lý nhiều trường)',
        role: Role.ACCOUNTANT,
        companyId: company.id,
      });
    }
    let cashier = await usersService.findByEmail('thuquy@eduacc.vn');
    if (!cashier) {
      cashier = await usersService.create({
        email: 'thuquy@eduacc.vn',
        password: 'ThuQuy@123456',
        fullName: 'Thủ quỹ công ty (quản lý nhiều trường)',
        role: Role.CASHIER,
        companyId: company.id,
      });
    }

    logger.log('Seeding academic year 2026-2027...');
    const years = await academicYearsService.findAll({
      schoolId: school.id,
      page: 1,
      limit: 10,
      skip: 0,
    });
    let academicYear: AcademicYear | undefined = years.data.find(
      (y) => y.name === '2026-2027',
    );
    if (!academicYear) {
      academicYear = await academicYearsService.create({
        schoolId: school.id,
        name: '2026-2027',
        startDate: '2026-09-05',
        endDate: '2027-05-31',
        status: AcademicYearStatus.ACTIVE,
      });
    }
    logger.log(`Academic year: ${academicYear.name} (${academicYear.id})`);

    logger.log('Seeding classes 1A1, 1A2, 1A3...');
    const classCodes = ['1A1', '1A2', '1A3'];
    const classes: Record<
      string,
      Awaited<ReturnType<typeof classesService.create>>
    > = {};
    for (const code of classCodes) {
      const existing = await classesService.findAll({
        schoolId: school.id,
        academicYearId: academicYear.id,
        search: code,
        page: 1,
        limit: 1,
        skip: 0,
      });
      classes[code] =
        existing.data.find((c) => c.code === code) ??
        (await classesService.create({
          schoolId: school.id,
          academicYearId: academicYear.id,
          code,
          name: code,
          grade: '1',
        }));
    }

    logger.log('Seeding fee category "Kỹ năng sống"...');
    const feeCategories = await feeCategoriesService.findAll({
      schoolId: school.id,
      page: 1,
      limit: 50,
      skip: 0,
    });
    let feeCategory: FeeCategory | undefined = feeCategories.data.find(
      (c) => c.code === 'KNS',
    );
    if (!feeCategory) {
      feeCategory = await feeCategoriesService.create({
        schoolId: school.id,
        code: 'KNS',
        name: 'Kỹ năng sống',
        description: 'Chương trình giáo dục kỹ năng sống',
      });
    }

    logger.log('Seeding fee plan "Kỹ năng sống năm học 2026-2027"...');
    const feePlans = await feePlansService.findAll({
      schoolId: school.id,
      page: 1,
      limit: 50,
      skip: 0,
    });
    let feePlan: FeePlan | undefined = feePlans.data.find(
      (p) => p.code === 'KNS-2627',
    );
    if (!feePlan) {
      feePlan = await feePlansService.create({
        schoolId: school.id,
        academicYearId: academicYear.id,
        feeCategoryId: feeCategory.id,
        code: 'KNS-2627',
        name: 'Học phí môn Kỹ năng sống năm học 2026-2027',
        billingType: BillingType.MONTHLY,
        unitPrice: '80000',
        quantity: '9',
        status: FeePlanStatus.ACTIVE,
      });
    }
    logger.log(
      `Fee plan: ${feePlan.code} — ${feePlan.defaultAmount.toFixed(2)}`,
    );

    logger.log('Seeding sample students in class 1A1...');
    const sampleStudents = [
      {
        fullName: 'Nguyễn Văn A',
        parentName: 'Nguyễn Văn Bố',
        parentPhone: '0901111111',
      },
      {
        fullName: 'Trần Thị B',
        parentName: 'Trần Văn Bố',
        parentPhone: '0902222222',
      },
      {
        fullName: 'Lê Hoàng C',
        parentName: 'Lê Thị Mẹ',
        parentPhone: '0903333333',
      },
    ];
    for (const s of sampleStudents) {
      const existingStudents = await studentsService.findAll({
        schoolId: school.id,
        search: s.fullName,
        page: 1,
        limit: 1,
        skip: 0,
      });
      const student =
        existingStudents.data.find((x) => x.fullName === s.fullName) ??
        (await studentsService.create({ schoolId: school.id, ...s }));

      await studentClassesService.assign({
        studentId: student.id,
        classId: classes['1A1'].id,
        academicYearId: academicYear.id,
      });
      logger.log(`Student: ${student.studentCode} — ${student.fullName}`);
    }

    logger.log('Seed completed successfully.');
    logger.log('Login credentials:');
    logger.log(
      '  SUPER_ADMIN: admin@kimdong.edu.vn / Admin@123456  (unrestricted)',
    );
    logger.log(
      '  ACCOUNTANT : ketoan@eduacc.vn / KeToan@123456     (company-wide: KIMDONG + LEVANTAM)',
    );
    logger.log(
      '  CASHIER    : thuquy@eduacc.vn / ThuQuy@123456     (company-wide: KIMDONG + LEVANTAM)',
    );
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  logger.error(err);
  process.exit(1);
});
