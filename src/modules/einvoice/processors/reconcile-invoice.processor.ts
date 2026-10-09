import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { E_INVOICE_QUEUES } from '../providers/viettel/viettel-sinvoice.constants';
import { EInvoiceWorkflowService } from '../services/einvoice-workflow.service';

@Processor(E_INVOICE_QUEUES.RECONCILE)
export class ReconcileInvoiceProcessor extends WorkerHost {
  constructor(private readonly workflow: EInvoiceWorkflowService) {
    super();
  }
  process(job: Job<{ invoiceId: string }>): Promise<void> {
    return this.workflow.reconcile(job.data.invoiceId);
  }
}
