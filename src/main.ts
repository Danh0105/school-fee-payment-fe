import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  app.enableCors({
    origin: config.get<string[]>('cors.origins'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('School Fee Payment API')
    .setDescription(
      'Hệ thống quản lý thu tiền học sinh và thanh toán QR động — công nợ, giao dịch, đối soát, phiếu thu, báo cáo kế toán.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth')
    .addTag('Users')
    .addTag('Schools')
    .addTag('Academic Years')
    .addTag('Semesters')
    .addTag('Classes')
    .addTag('Students')
    .addTag('Fee Categories')
    .addTag('Fee Plans')
    .addTag('Receivables')
    .addTag('Payment Orders')
    .addTag('Payments')
    .addTag('Reconciliation')
    .addTag('Receipts')
    .addTag('Refunds')
    .addTag('Reports')
    .addTag('Dashboard')
    .addTag('Imports')
    .addTag('Exports')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get<number>('port') ?? 3010;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Application is running on: http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
