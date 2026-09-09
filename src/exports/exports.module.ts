import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportsService } from './exports.service';
import { ExportsController } from './exports.controller';
import { ReportsModule } from '../reports/reports.module';
import { Class } from '../classes/entities/class.entity';

@Module({
  imports: [ReportsModule, TypeOrmModule.forFeature([Class])],
  providers: [ExportsService],
  controllers: [ExportsController],
})
export class ExportsModule {}
