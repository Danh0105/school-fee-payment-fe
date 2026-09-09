import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentClass } from './entities/student-class.entity';
import { StudentClassesService } from './student-classes.service';
import { StudentClassesController } from './student-classes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StudentClass])],
  providers: [StudentClassesService],
  controllers: [StudentClassesController],
  exports: [StudentClassesService],
})
export class StudentClassesModule {}
