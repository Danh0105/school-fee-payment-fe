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
import { ImportTemplateService } from './import-template.service';
import { StudentsModule } from '../students/students.module';
import { StudentClassesModule } from '../student-classes/student-classes.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { FeePlansModule } from '../fee-plans/fee-plans.module';
import { School } from '../schools/entities/school.entity';
import { AcademicYear } from '../academic-years/entities/academic-year.entity';
import { SemestersModule } from '../semesters/semesters.module';
import { PaymentProvidersModule } from '../payment-providers/payment-providers.module';
import { ImportPaymentQrPdfService } from './import-payment-qr-pdf.service';
import { ImportPaymentOrdersService } from './import-payment-orders.service';
import { PaymentOrder } from '../payment-orders/entities/payment-order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ImportSession,
      Class,
      Student,
      StudentReceivable,
      School,
      AcademicYear,
      PaymentOrder,
    ]),
    StudentsModule,
    StudentClassesModule,
    ReceivablesModule,
    FeePlansModule,
    SemestersModule,
    PaymentProvidersModule,
  ],
  providers: [
    ImportsService,
    ExcelParserService,
    ImportValidationService,
    ImportTemplateService,
    ImportPaymentQrPdfService,
    ImportPaymentOrdersService,
  ],
  controllers: [ImportsController],
  exports: [ImportsService],
})
export class ImportsModule {}
