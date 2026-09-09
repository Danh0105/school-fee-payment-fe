import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentCredit } from './entities/student-credit.entity';
import { StudentCreditsService } from './student-credits.service';
import { StudentCreditsController } from './student-credits.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StudentCredit])],
  providers: [StudentCreditsService],
  controllers: [StudentCreditsController],
  exports: [StudentCreditsService],
})
export class StudentCreditsModule {}
