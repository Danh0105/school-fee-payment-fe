import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Class } from './entities/class.entity';
import { ClassesService } from './classes.service';
import { ClassesController } from './classes.controller';
import { StudentClassesModule } from '../student-classes/student-classes.module';

@Module({
  imports: [TypeOrmModule.forFeature([Class]), StudentClassesModule],
  providers: [ClassesService],
  controllers: [ClassesController],
  exports: [ClassesService],
})
export class ClassesModule {}
