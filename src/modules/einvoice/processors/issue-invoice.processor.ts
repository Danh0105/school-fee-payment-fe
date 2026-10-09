import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { E_INVOICE_QUEUES } from '../providers/viettel/viettel-sinvoice.constants';
import { EInvoiceWorkflowService } from '../services/einvoice-workflow.service';

@Processor(E_INVOICE_QUEUES.ISSUE)
export class IssueInvoiceProcessor extends WorkerHost {
  constructor(private readonly workflow: EInvoiceWorkflowService) {
    super();
  }
  process(job: Job<{ invoiceId: string }>): Promise<void> {
    return this.workflow.issue(job.data.invoiceId);
  }
}
