import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportSession } from './entities/import-session.entity';
import { Class } from '../classes/entities/class.entity';
import { Student } from '../students/entities/student.entity';
import { StudentReceivable } from '../receivables/entities/student-receivable.entity';
import { ImportsService } from './imports.service';
import { ImportsController } from './imports.controller';
import { ExcelParserService } from './excel-parser.service';
import { ImportValidationService } from './import-validation.service';
import { StudentsModule } from '../students/students.module';
import { StudentClassesModule } from '../student-classes/student-classes.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { FeePlansModule } from '../fee-plans/fee-plans.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ImportSession,
      Class,
      Student,
      StudentReceivable,
    ]),
    StudentsModule,
    StudentClassesModule,
    ReceivablesModule,
    FeePlansModule,
  ],
  providers: [ImportsService, ExcelParserService, ImportValidationService],
  controllers: [ImportsController],
  exports: [ImportsService],
})
export class ImportsModule {}
