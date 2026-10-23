import { ImportValidationService } from './import-validation.service';
import { ImportSessionType } from './entities/import-session.entity';
import { Gender } from '../students/entities/student.entity';
import { StudentStatus } from '../common/enums/status.enum';

describe('ImportValidationService student fields', () => {
  const classRepository = {
    find: jest.fn().mockResolvedValue([{ id: 'class-1', code: '1A1' }]),
  };
  const studentRepository = {
    find: jest.fn().mockResolvedValue([]),
  };
  const receivableRepository = {
    find: jest.fn().mockResolvedValue([]),
  };
  const service = new ImportValidationService(
    classRepository as never,
    studentRepository as never,
    receivableRepository as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('normalizes every student field from the full template', async () => {
    const result = await service.validate(
      [
        {
          sheet: 'Dữ liệu import',
          rowNumber: 2,
          values: {
            studentCode: 'HS001',
            identifierCode: '012345678901',
            fullName: 'Nguyễn Thị A',
            dateOfBirth: '15/08/2015',
            gender: 'Nữ',
            address: 'Hà Nội',
            phone: '0911111111',
            parentName: 'Nguyễn Văn B',
            parentPhone: '0922222222',
            parentEmail: 'phuhuynh@example.com',
            status: 'Đang học',
            classCode: '1A1',
          },
        },
      ],
      {
        type: ImportSessionType.STUDENTS,
        schoolId: 'school-1',
      },
      'academic-year-1',
    );

    expect(result.errors).toEqual([]);
    expect(result.validRows[0]).toMatchObject({
      studentCode: 'HS001',
      identifierCode: '012345678901',
      fullName: 'Nguyễn Thị A',
      dateOfBirth: '2015-08-15',
      gender: Gender.FEMALE,
      address: 'Hà Nội',
      phone: '0911111111',
      parentName: 'Nguyễn Văn B',
      parentPhone: '0922222222',
      parentEmail: 'phuhuynh@example.com',
      status: StudentStatus.ACTIVE,
      classCode: '1A1',
    });
  });

  it('accepts a class name without school, class, or student codes for bootstrap import', async () => {
    classRepository.find.mockResolvedValueOnce([]);

    const result = await service.validate(
      [
        {
          sheet: 'Dữ liệu import',
          rowNumber: 2,
          values: {
            fullName: 'Nguyễn Văn A',
            className: 'Lớp 1A1',
          },
        },
      ],
      {
        type: ImportSessionType.STUDENTS,
        schoolId: 'new-school',
        allowCreateClasses: true,
      },
      'new-academic-year',
    );

    expect(result.errors).toEqual([]);
    expect(result.validRows[0]).toMatchObject({
      studentCode: null,
      classCode: 'Lớp 1A1',
      className: 'Lớp 1A1',
      classGrade: null,
    });
  });

  it('preserves an optional payment amount and transfer content for bulk QR export', async () => {
    const result = await service.validate(
      [
        {
          sheet: '3A4',
          rowNumber: 2,
          values: {
            fullName: 'Phan Dương Linh Đan',
            dateOfBirth: '21/09/2018',
            identifierCode: '072318004706',
            parentPhone: '0358228913',
            originalAmount: '560.000',
            legacyTransferContent:
              'HV072318004706 THVTS Lớp 3A4 Phan Dương Linh Đan',
            classCode: '1A1',
          },
        },
      ],
      {
        type: ImportSessionType.STUDENTS,
        schoolId: 'school-1',
      },
      'academic-year-1',
    );

    expect(result.errors).toEqual([]);
    expect(result.validRows[0]).toMatchObject({
      originalAmount: '560000.00',
      legacyTransferContent: 'HV072318004706 THVTS Lớp 3A4 Phan Dương Linh Đan',
    });
  });
});
