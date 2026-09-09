import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { SnakeNamingStrategy } from './database/snake-naming.strategy';
import { DatabaseModule } from './database/database.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SchoolsModule } from './schools/schools.module';
import { AcademicYearsModule } from './academic-years/academic-years.module';
import { SemestersModule } from './semesters/semesters.module';
import { ClassesModule } from './classes/classes.module';
import { StudentsModule } from './students/students.module';
import { StudentClassesModule } from './student-classes/student-classes.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { FeeCategoriesModule } from './fee-categories/fee-categories.module';
import { FeePlansModule } from './fee-plans/fee-plans.module';
import { FeeAssignmentsModule } from './fee-assignments/fee-assignments.module';
import { ReceivablesModule } from './receivables/receivables.module';
import { DiscountsModule } from './discounts/discounts.module';
import { AdjustmentsModule } from './adjustments/adjustments.module';
import { LedgerModule } from './ledger/ledger.module';
import { PaymentProvidersModule } from './payment-providers/payment-providers.module';
import { PaymentOrdersModule } from './payment-orders/payment-orders.module';
import { PaymentAllocationsModule } from './payment-allocations/payment-allocations.module';
import { PaymentTransactionsModule } from './payment-transactions/payment-transactions.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { RefundsModule } from './refunds/refunds.module';
import { StudentCreditsModule } from './student-credits/student-credits.module';
import { ImportsModule } from './imports/imports.module';
import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExportsModule } from './exports/exports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.database'),
        namingStrategy: new SnakeNamingStrategy(),
        autoLoadEntities: true,
        synchronize: false,
        logging:
          config.get<string>('nodeEnv') === 'development'
            ? ['error', 'warn']
            : ['error'],
      }),
    }),
    DatabaseModule,
    AuditLogsModule,
    AuthModule,
    UsersModule,
    SchoolsModule,
    AcademicYearsModule,
    SemestersModule,
    ClassesModule,
    StudentsModule,
    StudentClassesModule,
    FeeCategoriesModule,
    FeePlansModule,
    FeeAssignmentsModule,
    LedgerModule,
    ReceivablesModule,
    DiscountsModule,
    AdjustmentsModule,
    StudentCreditsModule,
    PaymentProvidersModule,
    PaymentOrdersModule,
    ReceiptsModule,
    PaymentAllocationsModule,
    PaymentTransactionsModule,
    ReconciliationModule,
    RefundsModule,
    ImportsModule,
    ReportsModule,
    DashboardModule,
    ExportsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
