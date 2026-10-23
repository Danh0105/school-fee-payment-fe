import { ImportsService } from './imports.service';
import { ImportSessionType } from './entities/import-session.entity';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

describe('ImportsService file validation', () => {
  const service = new ImportsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const dto = {
    schoolId: '00000000-0000-4000-8000-000000000001',
    academicYearId: '00000000-0000-4000-8000-000000000002',
    type: ImportSessionType.STUDENTS,
  };
  const actor = {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'admin@example.com',
    role: 'ADMIN' as const,
    schoolId: null,
    companyId: null,
  };

  it('returns a validation error when the file is missing', async () => {
    await expect(service.preview(undefined, dto, actor)).rejects.toMatchObject({
      errorCode: ErrorCode.VALIDATION_ERROR,
      message: 'Vui lòng chọn file Excel để import',
    } satisfies Partial<AppException>);
  });

  it('explains how to convert a legacy .xls file', async () => {
    const file = {
      originalname: 'danh-sach-hoc-sinh.xls',
      buffer: Buffer.from('legacy excel'),
    } as Express.Multer.File;

    try {
      await service.preview(file, dto, actor);
      throw new Error('Expected preview to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).errorCode).toBe(
        ErrorCode.VALIDATION_ERROR,
      );
      expect((error as AppException).message).toContain(
        'Excel Workbook (*.xlsx)',
      );
    }
  });
});
