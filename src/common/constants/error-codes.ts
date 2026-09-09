export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_FOUND = 'NOT_FOUND',

  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  INVALID_REFRESH_TOKEN = 'INVALID_REFRESH_TOKEN',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_INACTIVE = 'USER_INACTIVE',
  EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',

  COMPANY_NOT_FOUND = 'COMPANY_NOT_FOUND',
  COMPANY_CODE_EXISTS = 'COMPANY_CODE_EXISTS',

  SCHOOL_NOT_FOUND = 'SCHOOL_NOT_FOUND',
  SCHOOL_CODE_EXISTS = 'SCHOOL_CODE_EXISTS',
  SCHOOL_OUT_OF_SCOPE = 'SCHOOL_OUT_OF_SCOPE',

  ACADEMIC_YEAR_NOT_FOUND = 'ACADEMIC_YEAR_NOT_FOUND',
  SEMESTER_NOT_FOUND = 'SEMESTER_NOT_FOUND',

  CLASS_NOT_FOUND = 'CLASS_NOT_FOUND',
  CLASS_CODE_EXISTS = 'CLASS_CODE_EXISTS',

  STUDENT_NOT_FOUND = 'STUDENT_NOT_FOUND',
  STUDENT_CODE_EXISTS = 'STUDENT_CODE_EXISTS',

  FEE_CATEGORY_NOT_FOUND = 'FEE_CATEGORY_NOT_FOUND',
  FEE_PLAN_NOT_FOUND = 'FEE_PLAN_NOT_FOUND',
  FEE_PLAN_NOT_ACTIVE = 'FEE_PLAN_NOT_ACTIVE',

  RECEIVABLE_NOT_FOUND = 'RECEIVABLE_NOT_FOUND',
  RECEIVABLE_ALREADY_PAID = 'RECEIVABLE_ALREADY_PAID',
  RECEIVABLE_CANCELLED = 'RECEIVABLE_CANCELLED',

  DISCOUNT_INVALID = 'DISCOUNT_INVALID',
  ADJUSTMENT_NOT_FOUND = 'ADJUSTMENT_NOT_FOUND',

  PAYMENT_ORDER_NOT_FOUND = 'PAYMENT_ORDER_NOT_FOUND',
  PAYMENT_ORDER_EXPIRED = 'PAYMENT_ORDER_EXPIRED',
  PAYMENT_ORDER_NOT_PENDING = 'PAYMENT_ORDER_NOT_PENDING',

  TRANSACTION_DUPLICATED = 'TRANSACTION_DUPLICATED',
  TRANSACTION_NOT_FOUND = 'TRANSACTION_NOT_FOUND',
  TRANSACTION_ALREADY_ALLOCATED = 'TRANSACTION_ALREADY_ALLOCATED',
  TRANSACTION_ALREADY_MATCHED = 'TRANSACTION_ALREADY_MATCHED',
  TRANSACTION_REVERSED = 'TRANSACTION_REVERSED',

  PAYMENT_AMOUNT_INVALID = 'PAYMENT_AMOUNT_INVALID',
  PAYMENT_AMOUNT_EXCEEDS_AVAILABLE = 'PAYMENT_AMOUNT_EXCEEDS_AVAILABLE',

  RECEIPT_NOT_FOUND = 'RECEIPT_NOT_FOUND',
  RECEIPT_ALREADY_CANCELLED = 'RECEIPT_ALREADY_CANCELLED',

  REFUND_NOT_FOUND = 'REFUND_NOT_FOUND',
  REFUND_AMOUNT_INVALID = 'REFUND_AMOUNT_INVALID',

  STUDENT_CREDIT_INSUFFICIENT = 'STUDENT_CREDIT_INSUFFICIENT',

  IMPORT_VALIDATION_FAILED = 'IMPORT_VALIDATION_FAILED',
  IMPORT_SESSION_NOT_FOUND = 'IMPORT_SESSION_NOT_FOUND',

  ZALO_NOT_CONFIGURED = 'ZALO_NOT_CONFIGURED',
  ZALO_SEND_FAILED = 'ZALO_SEND_FAILED',
  PARENT_PHONE_MISSING = 'PARENT_PHONE_MISSING',
}

export const ErrorMessages: Record<ErrorCode, string> = {
  [ErrorCode.VALIDATION_ERROR]: 'Dữ liệu không hợp lệ',
  [ErrorCode.UNAUTHORIZED]: 'Chưa xác thực',
  [ErrorCode.FORBIDDEN]: 'Không có quyền thực hiện thao tác này',
  [ErrorCode.INTERNAL_ERROR]: 'Đã xảy ra lỗi hệ thống',
  [ErrorCode.NOT_FOUND]: 'Không tìm thấy dữ liệu',

  [ErrorCode.INVALID_CREDENTIALS]: 'Tài khoản hoặc mật khẩu không đúng',
  [ErrorCode.INVALID_REFRESH_TOKEN]: 'Refresh token không hợp lệ',
  [ErrorCode.USER_NOT_FOUND]: 'Không tìm thấy người dùng',
  [ErrorCode.USER_INACTIVE]: 'Tài khoản đã bị vô hiệu hóa',
  [ErrorCode.EMAIL_ALREADY_EXISTS]: 'Email đã tồn tại',

  [ErrorCode.COMPANY_NOT_FOUND]: 'Không tìm thấy đơn vị quản lý',
  [ErrorCode.COMPANY_CODE_EXISTS]: 'Mã đơn vị quản lý đã tồn tại',

  [ErrorCode.SCHOOL_NOT_FOUND]: 'Không tìm thấy trường học',
  [ErrorCode.SCHOOL_CODE_EXISTS]: 'Mã trường đã tồn tại',
  [ErrorCode.SCHOOL_OUT_OF_SCOPE]: 'Bạn không có quyền truy cập trường học này',

  [ErrorCode.ACADEMIC_YEAR_NOT_FOUND]: 'Không tìm thấy năm học',
  [ErrorCode.SEMESTER_NOT_FOUND]: 'Không tìm thấy học kỳ',

  [ErrorCode.CLASS_NOT_FOUND]: 'Không tìm thấy lớp học',
  [ErrorCode.CLASS_CODE_EXISTS]: 'Mã lớp đã tồn tại',

  [ErrorCode.STUDENT_NOT_FOUND]: 'Không tìm thấy học sinh',
  [ErrorCode.STUDENT_CODE_EXISTS]: 'Mã học sinh đã tồn tại',

  [ErrorCode.FEE_CATEGORY_NOT_FOUND]: 'Không tìm thấy danh mục khoản thu',
  [ErrorCode.FEE_PLAN_NOT_FOUND]: 'Không tìm thấy khoản thu',
  [ErrorCode.FEE_PLAN_NOT_ACTIVE]: 'Khoản thu chưa được kích hoạt',

  [ErrorCode.RECEIVABLE_NOT_FOUND]: 'Không tìm thấy khoản công nợ',
  [ErrorCode.RECEIVABLE_ALREADY_PAID]: 'Khoản công nợ đã được thanh toán đủ',
  [ErrorCode.RECEIVABLE_CANCELLED]: 'Khoản công nợ đã bị hủy',

  [ErrorCode.DISCOUNT_INVALID]: 'Thông tin miễn giảm không hợp lệ',
  [ErrorCode.ADJUSTMENT_NOT_FOUND]: 'Không tìm thấy chứng từ điều chỉnh',

  [ErrorCode.PAYMENT_ORDER_NOT_FOUND]: 'Không tìm thấy yêu cầu thanh toán',
  [ErrorCode.PAYMENT_ORDER_EXPIRED]: 'Yêu cầu thanh toán đã hết hạn',
  [ErrorCode.PAYMENT_ORDER_NOT_PENDING]:
    'Yêu cầu thanh toán không ở trạng thái chờ',

  [ErrorCode.TRANSACTION_DUPLICATED]: 'Giao dịch đã được ghi nhận trước đó',
  [ErrorCode.TRANSACTION_NOT_FOUND]: 'Không tìm thấy giao dịch',
  [ErrorCode.TRANSACTION_ALREADY_ALLOCATED]:
    'Giao dịch đã được phân bổ toàn bộ',
  [ErrorCode.TRANSACTION_ALREADY_MATCHED]: 'Giao dịch đã được đối soát',
  [ErrorCode.TRANSACTION_REVERSED]: 'Giao dịch đã bị đảo',

  [ErrorCode.PAYMENT_AMOUNT_INVALID]: 'Số tiền thanh toán không hợp lệ',
  [ErrorCode.PAYMENT_AMOUNT_EXCEEDS_AVAILABLE]:
    'Số tiền phân bổ vượt quá số tiền khả dụng',

  [ErrorCode.RECEIPT_NOT_FOUND]: 'Không tìm thấy phiếu thu',
  [ErrorCode.RECEIPT_ALREADY_CANCELLED]: 'Phiếu thu đã bị hủy',

  [ErrorCode.REFUND_NOT_FOUND]: 'Không tìm thấy yêu cầu hoàn tiền',
  [ErrorCode.REFUND_AMOUNT_INVALID]: 'Số tiền hoàn không hợp lệ',

  [ErrorCode.STUDENT_CREDIT_INSUFFICIENT]: 'Số dư có của học sinh không đủ',

  [ErrorCode.IMPORT_VALIDATION_FAILED]: 'Dữ liệu import chưa hợp lệ',
  [ErrorCode.IMPORT_SESSION_NOT_FOUND]: 'Không tìm thấy phiên import',

  [ErrorCode.ZALO_NOT_CONFIGURED]: 'Chưa cấu hình kết nối Zalo OA',
  [ErrorCode.ZALO_SEND_FAILED]: 'Gửi thông báo qua Zalo thất bại',
  [ErrorCode.PARENT_PHONE_MISSING]: 'Học sinh chưa có số điện thoại phụ huynh',
};
