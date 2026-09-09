export enum EntityStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum AcademicYearStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
}

export enum SemesterStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
}

export enum ClassStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum StudentStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  GRADUATED = 'GRADUATED',
  TRANSFERRED = 'TRANSFERRED',
}

export enum StudentClassStatus {
  ACTIVE = 'ACTIVE',
  LEFT = 'LEFT',
}

export enum FeeCategoryStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum BillingType {
  ONE_TIME = 'ONE_TIME',
  MONTHLY = 'MONTHLY',
  CUSTOM = 'CUSTOM',
}

export enum FeePlanStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

export enum FeeAssignmentTargetType {
  SCHOOL = 'SCHOOL',
  GRADE = 'GRADE',
  CLASS = 'CLASS',
  STUDENT = 'STUDENT',
}

export enum ReceivableStatus {
  DRAFT = 'DRAFT',
  UNPAID = 'UNPAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

export enum DiscountType {
  FIXED_AMOUNT = 'FIXED_AMOUNT',
  PERCENTAGE = 'PERCENTAGE',
}

export enum AdjustmentType {
  INCREASE = 'INCREASE',
  DECREASE = 'DECREASE',
}

export enum AdjustmentStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentOrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

export enum PaymentMethod {
  BANK_TRANSFER = 'BANK_TRANSFER',
  VIETQR = 'VIETQR',
  CASH = 'CASH',
  OTHER = 'OTHER',
}

export enum PaymentProviderCode {
  VIETQR = 'VIETQR',
  MANUAL_BANK = 'MANUAL_BANK',
}

export enum PaymentTransactionStatus {
  RECEIVED = 'RECEIVED',
  MATCHED = 'MATCHED',
  UNMATCHED = 'UNMATCHED',
  ALLOCATED = 'ALLOCATED',
  REVERSED = 'REVERSED',
}

export enum ReceiptStatus {
  ISSUED = 'ISSUED',
  CANCELLED = 'CANCELLED',
}

export enum RefundStatus {
  REQUESTED = 'REQUESTED',
  APPROVED = 'APPROVED',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum ReconciliationStatus {
  AUTO_MATCHED = 'AUTO_MATCHED',
  MANUAL_MATCHED = 'MANUAL_MATCHED',
  UNMATCHED = 'UNMATCHED',
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
  DUPLICATE = 'DUPLICATE',
  REVERSED = 'REVERSED',
}

export enum LedgerEntryType {
  RECEIVABLE = 'RECEIVABLE',
  PAYMENT = 'PAYMENT',
  DISCOUNT = 'DISCOUNT',
  ADJUSTMENT_INCREASE = 'ADJUSTMENT_INCREASE',
  ADJUSTMENT_DECREASE = 'ADJUSTMENT_DECREASE',
  REFUND = 'REFUND',
  CREDIT = 'CREDIT',
  REVERSAL = 'REVERSAL',
}

export enum StudentCreditStatus {
  AVAILABLE = 'AVAILABLE',
  HELD = 'HELD',
  REFUNDED = 'REFUNDED',
  ALLOCATED = 'ALLOCATED',
}

export enum StudentCreditTxnType {
  CREATED = 'CREATED',
  ALLOCATED = 'ALLOCATED',
  REFUNDED = 'REFUNDED',
}
