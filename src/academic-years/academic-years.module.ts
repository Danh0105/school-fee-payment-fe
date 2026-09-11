import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcademicYear } from './entities/academic-year.entity';
import { AcademicYearsService } from './academic-years.service';
import { AcademicYearsController } from './academic-years.controller';
import { SemestersModule } from '../semesters/semesters.module';

@Module({
  imports: [TypeOrmModule.forFeature([AcademicYear]), SemestersModule],
  providers: [AcademicYearsService],
  controllers: [AcademicYearsController],
  exports: [AcademicYearsService],
})
export class AcademicYearsModule {}
