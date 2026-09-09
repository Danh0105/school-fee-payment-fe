import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeAssignment } from './entities/fee-assignment.entity';
import { FeeAssignmentsService } from './fee-assignments.service';
import { FeeAssignmentsController } from './fee-assignments.controller';
import { FeePlansModule } from '../fee-plans/fee-plans.module';
import { StudentClassesModule } from '../student-classes/student-classes.module';
import { ReceivablesModule } from '../receivables/receivables.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FeeAssignment]),
    FeePlansModule,
    StudentClassesModule,
    ReceivablesModule,
  ],
  providers: [FeeAssignmentsService],
  controllers: [FeeAssignmentsController],
  exports: [FeeAssignmentsService],
})
export class FeeAssignmentsModule {}
