import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeCategory } from './entities/fee-category.entity';
import { FeeCategoriesService } from './fee-categories.service';
import { FeeCategoriesController } from './fee-categories.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FeeCategory])],
  providers: [FeeCategoriesService],
  controllers: [FeeCategoriesController],
  exports: [FeeCategoriesService],
})
export class FeeCategoriesModule {}
