import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { StudentsModule } from '../students/students.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { PaymentOrdersModule } from '../payment-orders/payment-orders.module';
import { SchoolsModule } from '../schools/schools.module';
import { ParentAuthController } from './parent-auth.controller';
import { ParentPortalController } from './parent-portal.controller';
import { ParentAuthService } from './parent-auth.service';
import { ParentJwtStrategy } from './strategies/parent-jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    StudentsModule,
    ReceivablesModule,
    PaymentOrdersModule,
    SchoolsModule,
  ],
  controllers: [ParentAuthController, ParentPortalController],
  providers: [ParentAuthService, ParentJwtStrategy],
})
export class ParentPortalModule {}
