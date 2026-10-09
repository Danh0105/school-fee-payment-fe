import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from '../../access-control/access-control.module';
import { EInvoiceController } from './einvoice.controller';
import { EInvoiceService } from './einvoice.service';
import { EInvoiceAttempt } from './entities/einvoice-attempt.entity';
import { EInvoiceConfig } from './entities/einvoice-config.entity';
import { EInvoiceEvent } from './entities/einvoice-event.entity';
import { EInvoiceFile } from './entities/einvoice-file.entity';
import { EInvoice } from './entities/einvoice.entity';
import { DownloadInvoiceProcessor } from './processors/download-invoice.processor';
import { IssueInvoiceProcessor } from './processors/issue-invoice.processor';
import { ReconcileInvoiceProcessor } from './processors/reconcile-invoice.processor';
import { SendEmailProcessor } from './processors/send-email.processor';
import { E_INVOICE_PROVIDER } from './providers/einvoice-provider.interface';
import { E_INVOICE_QUEUES } from './providers/viettel/viettel-sinvoice.constants';
import { ViettelSinvoiceModule } from './providers/viettel/viettel-sinvoice.module';
import { ViettelSinvoiceService } from './providers/viettel/viettel-sinvoice.service';
import { EInvoiceWorkflowService } from './services/einvoice-workflow.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EInvoice,
      EInvoiceConfig,
      EInvoiceAttempt,
      EInvoiceFile,
      EInvoiceEvent,
    ]),
    BullModule.registerQueue(
      { name: E_INVOICE_QUEUES.ISSUE },
      { name: E_INVOICE_QUEUES.RECONCILE },
      { name: E_INVOICE_QUEUES.DOWNLOAD },
      { name: E_INVOICE_QUEUES.SEND_EMAIL },
    ),
    ViettelSinvoiceModule,
    AccessControlModule,
  ],
  controllers: [EInvoiceController],
  providers: [
    EInvoiceService,
    EInvoiceWorkflowService,
    IssueInvoiceProcessor,
    ReconcileInvoiceProcessor,
    DownloadInvoiceProcessor,
    SendEmailProcessor,
    { provide: E_INVOICE_PROVIDER, useExisting: ViettelSinvoiceService },
  ],
  exports: [EInvoiceService],
})
export class EInvoiceModule {}
