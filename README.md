# School Fee Payment — Backend

Backend quản lý thu tiền học sinh và thanh toán QR động, xây dựng theo mô hình kế toán thực tế:

```
Trường học → Năm học → Học kỳ → Lớp → Học sinh → Khoản thu →
Công nợ → QR thanh toán → Giao dịch ngân hàng → Đối soát →
Phân bổ thanh toán → Phiếu thu → Sổ công nợ → Báo cáo
```

Mọi số tiền được lưu bằng `numeric(18,2)` trong PostgreSQL và xử lý bằng
`decimal.js` ở tầng ứng dụng — không dùng số thực JavaScript cho tiền.
Không có trường `isPaid` boolean nào cả: trạng thái thanh toán luôn được
suy ra từ `amountDue`/`amountPaid`/`amountOutstanding`, được backend tự
tính lại sau mỗi lần miễn giảm, điều chỉnh, hoặc phân bổ thanh toán.

## Công nghệ

NestJS · TypeScript · PostgreSQL · TypeORM · REST API · Swagger/OpenAPI ·
JWT · class-validator/class-transformer · ConfigModule · exceljs

## Kiến trúc chính

- **AuthModule / UsersModule** — JWT access + refresh token (rotation,
  hash lưu DB), role-based guard (`SUPER_ADMIN`, `ADMIN`, `ACCOUNTANT`,
  `CASHIER`, `VIEWER`) áp dụng qua `@Roles()` + `RolesGuard` toàn cục.
- **Schools → AcademicYears → Semesters → Classes → Students →
  StudentClasses** — cấu trúc trường học phân theo năm học, học sinh đổi
  lớp theo năm mà không ràng buộc cứng.
- **FeeCategories → FeePlans → FeeAssignments → StudentReceivables** —
  khoản thu được gán cho SCHOOL/GRADE/CLASS/STUDENT, backend tự sinh
  công nợ (`POST /fee-plans/:id/assign`), idempotent theo
  `(studentId, feePlanId)`.
- **Discounts / Adjustments** — miễn giảm và điều chỉnh công nợ luôn đi
  qua chứng từ riêng (`StudentDiscount`, `ReceivableAdjustment`), không
  sửa trực tiếp `amountDue`. Mỗi thay đổi ghi một dòng sổ cái
  (`StudentLedgerEntry`).
- **PaymentProviders (adapter pattern)** — `VIETQR` (EMVCo/NAPAS QR +
  webhook HMAC) và `MANUAL_BANK`, thêm provider mới (VNPay, MoMo, PayOS,
  Sepay, Casso...) chỉ cần implement `PaymentProvider` interface, không
  đụng vào business logic.
- **PaymentOrders → PaymentTransactions → PaymentAllocations** — một
  giao dịch ngân hàng có thể phân bổ cho nhiều khoản công nợ; một khoản
  công nợ có thể được thanh toán bởi nhiều giao dịch. Webhook idempotent
  bằng ràng buộc DB `(provider, externalTransactionId)`. Tiền thừa được
  giữ lại làm `StudentCredit`, không bao giờ mất.
- **Reconciliation** — tự động khớp theo `transferContent == orderCode`
  (không bao giờ khớp theo tên học sinh); giao dịch không khớp được vào
  `GET /reconciliation/unmatched` để kế toán khớp/hủy khớp thủ công, có
  audit log và có thể đảo ngược (reversal), không hard-delete.
- **Receipts / Refunds** — phiếu thu tự động phát hành sau mỗi lần phân
  bổ thành công; hoàn tiền chỉ rút từ số dư có (credit) chưa phân bổ của
  chính giao dịch đó.
- **Ledger** — `StudentLedgerEntry` là sổ cái bất biến (không update/
  delete), `GET /students/:id/ledger` trả về số dư lũy kế theo thời
  gian, dùng để đối chiếu mọi số liệu báo cáo.
- **Imports** — upload Excel → preview (validate, không ghi DB) → confirm
  (ghi DB trong 1 transaction). Nhận diện tiêu đề cột tiếng Việt có/không
  dấu.
- **Reports / Dashboard / Exports** — mọi số liệu tính trực tiếp từ dữ
  liệu tài chính (không lưu số liệu tĩnh), export ra file `.xlsx` thật.
- **AuditLog** — ghi lại mọi thao tác tài chính quan trọng (tạo công nợ,
  điều chỉnh, miễn giảm, thanh toán thủ công, khớp/hủy khớp giao dịch,
  phát hành/hủy phiếu thu, hoàn tiền, đảo giao dịch).

## Cài đặt

```bash
npm install
```

### Cơ sở dữ liệu

Cần PostgreSQL đang chạy (không dùng SQLite). Có thể dùng Postgres cài sẵn
trên máy hoặc Docker Compose đi kèm:

```bash
docker compose up -d db
```

Hoặc tạo database thủ công nếu đã có Postgres:

```bash
createdb school_fee
```

### Biến môi trường

```bash
cp .env.example .env
```

Sửa `.env` cho khớp với Postgres của bạn (`DB_HOST`, `DB_PORT`,
`DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`), đặt `JWT_SECRET` /
`JWT_REFRESH_SECRET` ngẫu nhiên, và cấu hình tài khoản ngân hàng mặc định
(`BANK_CODE`, `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_NAME`) nếu muốn seed
data tạo QR thật ngay.

### Migration

```bash
npm run migration:run
```

### Seed dữ liệu mẫu

Tạo trường Tiểu Học Kim Đồng, 3 tài khoản (SUPER_ADMIN/ACCOUNTANT/CASHIER),
năm học 2026-2027, lớp 1A1/1A2/1A3, khoản thu "Kỹ năng sống" (80.000đ x 9
tháng), và vài học sinh mẫu:

```bash
npm run seed
```

Tài khoản đăng nhập sau khi seed:

| Vai trò       | Email                     | Mật khẩu       |
| ------------- | -------------------------- | -------------- |
| SUPER_ADMIN   | admin@kimdong.edu.vn       | Admin@123456   |
| ACCOUNTANT    | ketoan@kimdong.edu.vn      | KeToan@123456  |
| CASHIER       | thuquy@kimdong.edu.vn      | ThuQuy@123456  |

### Chạy

```bash
npm run start:dev
```

Backend chạy tại `http://localhost:3010`. Swagger UI:
`http://localhost:3010/api/docs`.

## Test

```bash
# unit tests
npm run test

# e2e tests — cần một database Postgres riêng cho test (mặc định
# school_fee_test, khai báo trong .env.test); tạo và migrate trước:
createdb school_fee_test
DB_DATABASE=school_fee_test npm run migration:run
npm run test:e2e
```

`test/accounting.e2e-spec.ts` chạy toàn bộ app thật (không mock) và kiểm
tra đúng 10 tình huống kế toán bắt buộc: thanh toán đủ, thanh toán một
phần, thanh toán thừa (sinh credit), webhook trùng lặp (idempotent),
webhook đồng thời (không double-pay), miễn giảm, điều chỉnh tăng, hoàn
tiền, đảo giao dịch (reversal), và phân bổ một giao dịch cho nhiều khoản
công nợ.

## Migration scripts

```bash
npm run migration:generate -- src/database/migrations/TenMigration
npm run migration:run
npm run migration:revert
```

## Cấu trúc thư mục

```
src/
├── auth/ users/ schools/ academic-years/ semesters/ classes/
├── students/ student-classes/
├── fee-categories/ fee-plans/ fee-assignments/
├── receivables/ discounts/ adjustments/ ledger/ student-credits/
├── payment-providers/ payment-orders/ payment-transactions/
├── payment-allocations/ reconciliation/ receipts/ refunds/
├── imports/ exports/ reports/ dashboard/ audit-logs/
├── common/ (decorators, guards, filters, interceptors, enums, utils)
└── database/ (data-source, migrations, seeds, sequence service)
```

## Quy ước API

Response thành công:

```json
{ "success": true, "data": { } }
```

Response lỗi:

```json
{
  "success": false,
  "error": { "code": "RECEIVABLE_NOT_FOUND", "message": "Không tìm thấy khoản công nợ" },
  "path": "/receivables/...",
  "timestamp": "2026-09-09T02:00:00.000Z"
}
```

Danh sách phân trang:

```json
{ "data": [], "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 } }
```

Query chuẩn cho mọi API danh sách: `page`, `limit`, `search`, `sortBy`,
`sortOrder`, cộng thêm filter riêng của từng resource.

## Nguyên tắc kế toán bắt buộc (đã áp dụng trong code)

1. Không xóa cứng chứng từ tài chính — chỉ `CANCELLED`/`REVERSED`/`VOID`
   kèm chứng từ đảo.
2. Không sửa trực tiếp số tiền của công nợ đã phát hành — mọi thay đổi đi
   qua `StudentDiscount`/`ReceivableAdjustment`.
3. Một giao dịch ngân hàng chỉ ghi nhận một lần (idempotent theo
   `provider + externalTransactionId`).
4. Một giao dịch có thể phân bổ cho nhiều khoản công nợ, một khoản công
   nợ có thể nhận nhiều giao dịch — quan hệ N:N qua `PaymentAllocation`.
5. Thanh toán thiếu → `PARTIALLY_PAID`; thanh toán thừa → phần dư thành
   `StudentCredit`, không mất và không tự ý gán cho khoản nợ khác.
6. QR chỉ là phương tiện thanh toán, không phải bằng chứng kế toán — chỉ
   `PaymentTransaction` đã ghi nhận/đối soát mới được dùng để gạch nợ.
