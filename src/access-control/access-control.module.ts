import { Global, Module } from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { SchoolsModule } from '../schools/schools.module';

@Global()
@Module({
  imports: [SchoolsModule],
  providers: [AccessControlService],
  exports: [AccessControlService],
})
export class AccessControlModule {}
