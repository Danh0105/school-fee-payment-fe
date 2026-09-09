import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NumberSequence } from './entities/number-sequence.entity';
import { SequenceService } from './sequence.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([NumberSequence])],
  providers: [SequenceService],
  exports: [SequenceService],
})
export class DatabaseModule {}
