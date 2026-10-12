import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchStudentByNameDto } from './search-student-by-name.dto';

describe('SearchStudentByNameDto', () => {
  const schoolId = '00000000-0000-4000-8000-000000000001';

  it.each(['fullName', 'query', 'search', 'name', 'keyword'])(
    'accepts the Mini App search value from %s',
    async (field) => {
      const dto = plainToInstance(SearchStudentByNameDto, {
        schoolId,
        [field]: 'Nguyễn Văn',
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
    },
  );

  it('rejects a query shorter than three characters', async () => {
    const dto = plainToInstance(SearchStudentByNameDto, {
      schoolId,
      query: 'An',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'query')).toBe(true);
  });
});
