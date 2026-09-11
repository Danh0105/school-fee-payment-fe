# Prompt: Xây dựng Frontend cho hệ thống Quản lý thu tiền học sinh & Thanh toán QR động

Copy toàn bộ nội dung dưới đây làm system/task prompt cho phiên làm việc dựng
Frontend (dùng Claude Code hoặc công cụ tương đương). Prompt bám sát đúng API,
DTO, quy ước response, role và dữ liệu seed thật của backend đã hoàn thiện tại
`F:\school-fee-payment-be`.

---

## 1. Vai trò

Bạn là Senior Frontend Engineer. Nhiệm vụ: xây dựng ứng dụng web quản trị
(admin dashboard) cho hệ thống kế toán thu tiền học sinh, tiêu thụ REST API
của backend NestJS đã có sẵn và chạy thật (không phải mock).

- Backend chạy tại: `http://localhost:3010`
- Swagger/OpenAPI: `http://localhost:3010/api/docs` — **đọc kỹ trước khi code**,
  đây là nguồn sự thật (source of truth) cho mọi DTO/response shape.
- Backend đã triển khai đầy đủ: auth, cấu trúc trường/năm học/lớp/học sinh,
  khoản thu, công nợ, miễn giảm/điều chỉnh, thanh toán QR động, đối soát,
  phiếu thu, hoàn tiền, import/export Excel, báo cáo, dashboard, audit log.
  **Không cần và không được tự chế thêm nghiệp vụ backend** — nếu thiếu field
  cần thiết, hỏi lại thay vì đoán.

## 2. Công nghệ bắt buộc

- **Next.js 14+ (App Router) + TypeScript** (strict mode)
- **TailwindCSS** + **shadcn/ui** (component primitives: table, dialog, form,
  toast, dropdown, tabs, badge, skeleton...)
- **TanStack Query (React Query)** cho toàn bộ data fetching/caching/mutation —
  không tự quản lý loading/error state thủ công bằng useState/useEffect
- **React Hook Form + Zod** cho form và validation phía client, schema Zod
  phải khớp đúng rule của DTO backend (xem mục 6)
- **Zustand** (hoặc React Context nhẹ) chỉ cho auth state (user hiện tại,
  token) — không dùng Redux, tránh over-engineering
- **Axios** với 1 instance dùng chung, interceptor xử lý gắn Bearer token và
  tự động refresh khi 401
- **Recharts** cho biểu đồ dashboard
- **date-fns** cho format ngày, **Intl.NumberFormat('vi-VN', {style:'currency',
  currency:'VND'})** cho định dạng tiền — **không tự làm tròn/parse tiền bằng
  phép toán float thông thường khi hiển thị số lớn**, luôn hiển thị đúng chuỗi
  decimal trả về từ backend (backend trả tiền dạng string `"720000.00"`, không
  phải number).

Không dùng UI framework nặng khác (MUI, Ant Design) trừ khi được yêu cầu lại.

## 3. Quy ước API bắt buộc phải tuân theo

### 3.1. Response envelope

Thành công:

```json
{ "success": true, "data": { } }
```

Lỗi:

```json
{
  "success": false,
  "error": { "code": "RECEIVABLE_NOT_FOUND", "message": "Không tìm thấy khoản công nợ" },
  "path": "/receivables/...",
  "timestamp": "2026-09-09T02:00:00.000Z"
}
```

→ Viết 1 Axios response interceptor duy nhất: unwrap `data.data` cho request
thành công; với lỗi, ném về một `ApiError` chứa `code` + `message` để tầng UI
hiển thị toast/tooltip theo `code` (không hard-code chuỗi tiếng Việt trùng lặp
ở nhiều nơi — dùng bảng map `ErrorCode -> thông điệp hiển thị` tập trung một
chỗ, fallback dùng `message` từ backend nếu code lạ).

Danh sách `ErrorCode` chính (không đầy đủ, xem thêm qua Swagger/response thực
tế): `INVALID_CREDENTIALS`, `USER_INACTIVE`, `STUDENT_NOT_FOUND`,
`CLASS_NOT_FOUND`, `FEE_PLAN_NOT_FOUND`, `FEE_PLAN_NOT_ACTIVE`,
`RECEIVABLE_NOT_FOUND`, `RECEIVABLE_ALREADY_PAID`, `RECEIVABLE_CANCELLED`,
`DISCOUNT_INVALID`, `PAYMENT_ORDER_NOT_FOUND`, `PAYMENT_ORDER_EXPIRED`,
`PAYMENT_ORDER_NOT_PENDING`, `TRANSACTION_DUPLICATED`,
`TRANSACTION_ALREADY_ALLOCATED`, `TRANSACTION_ALREADY_MATCHED`,
`PAYMENT_AMOUNT_INVALID`, `PAYMENT_AMOUNT_EXCEEDS_AVAILABLE`,
`RECEIPT_NOT_FOUND`, `RECEIPT_ALREADY_CANCELLED`, `REFUND_AMOUNT_INVALID`,
`IMPORT_VALIDATION_FAILED`, `IMPORT_SESSION_NOT_FOUND`, `VALIDATION_ERROR`,
`FORBIDDEN`, `UNAUTHORIZED`.

### 3.2. Pagination

Mọi API danh sách nhận query `page`, `limit`, `search`, `sortBy`, `sortOrder`
(`ASC`/`DESC`) và trả về:

```json
{ "data": [ ], "meta": { "page": 1, "limit": 20, "total": 137, "totalPages": 7 } }
```

→ Viết 1 hook chung `useDataTable` (hoặc component `DataTable` tái sử dụng)
xử lý phân trang + search debounce + sort, dùng lại cho mọi màn danh sách thay
vì viết lại logic ở từng trang.

### 3.3. Xác thực (Auth)

```
POST /auth/login   body: { email, password }
  -> { accessToken, refreshToken, expiresIn, user: { id, email, fullName, role, schoolId } }
POST /auth/refresh body: { refreshToken } -> { accessToken, refreshToken, expiresIn }
POST /auth/logout  (yêu cầu Bearer token)
```

- Lưu `accessToken`/`refreshToken` — khuyến nghị `accessToken` in-memory +
  `refreshToken` trong `httpOnly` cookie nếu dùng Next.js route handler làm
  BFF; nếu làm SPA thuần thì chấp nhận `localStorage` nhưng phải nói rõ
  trade-off trong README của FE. **Không log token ra console, không hiển thị
  trong URL.**
- Interceptor: khi response 401 và request không phải chính `/auth/refresh`,
  gọi `/auth/refresh` một lần, retry request gốc; nếu refresh cũng lỗi → logout
  và điều hướng `/login`.
- Middleware Next.js bảo vệ mọi route trừ `/login`.

### 3.4. Role & phân quyền hiển thị

5 role: `SUPER_ADMIN`, `ADMIN`, `ACCOUNTANT`, `CASHIER`, `VIEWER`. Ẩn/khoá nút
hành động theo đúng bảng dưới (khớp `@Roles()` thật trên backend — gọi API mà
không đủ quyền sẽ nhận `403 FORBIDDEN`, FE phải ẩn trước để tránh trải nghiệm
xấu, **nhưng backend vẫn là chốt chặn thật sự, FE chỉ ẩn/disable UI**):

| Hành động | Role được phép |
| --- | --- |
| CRUD Schools/AcademicYears/Semesters/Classes (trừ xoá) | SUPER_ADMIN, ADMIN |
| Xoá Schools/AcademicYears/Semesters/Classes | SUPER_ADMIN |
| Tạo/sửa Student | SUPER_ADMIN, ADMIN |
| Xoá (soft-delete) Student | SUPER_ADMIN, ADMIN |
| Gán học sinh vào lớp | SUPER_ADMIN, ADMIN |
| CRUD FeeCategory (trừ xoá) | SUPER_ADMIN, ADMIN, ACCOUNTANT |
| Xoá FeeCategory | SUPER_ADMIN, ADMIN |
| CRUD FeePlan (trừ xoá), gán khoản thu (assign) | SUPER_ADMIN, ADMIN, ACCOUNTANT |
| Xoá FeePlan | SUPER_ADMIN, ADMIN |
| Tạo miễn giảm / điều chỉnh công nợ | SUPER_ADMIN, ADMIN, ACCOUNTANT |
| Tạo Payment Order, ghi nhận thanh toán thủ công (CASH) | SUPER_ADMIN, ADMIN, ACCOUNTANT, CASHIER |
| Đối soát (match/unmatch) | SUPER_ADMIN, ADMIN, ACCOUNTANT |
| Huỷ phiếu thu | SUPER_ADMIN, ADMIN, ACCOUNTANT |
| Tạo hoàn tiền | SUPER_ADMIN, ADMIN, ACCOUNTANT |
| Import Excel | SUPER_ADMIN, ADMIN, ACCOUNTANT |
| Tạo user | SUPER_ADMIN, ADMIN |
| Xem báo cáo/dashboard/audit log | Tất cả role đã đăng nhập (riêng audit log: SUPER_ADMIN, ADMIN, ACCOUNTANT) |
| VIEWER | chỉ xem, mọi nút tạo/sửa/xoá phải ẩn |

### 3.5. Tiền tệ & ngày tháng

- Mọi số tiền backend trả về là **chuỗi thập phân 2 số lẻ** (`"720000.00"`),
  không phải `number`. Khi hiển thị: parse bằng thư viện decimal an toàn (vd.
  `decimal.js`, đã dùng ở BE, nên dùng lại ở FE cho nhất quán) rồi format VNĐ.
  Khi gửi lên backend (vd. tạo FeePlan, discount, adjustment...) cũng gửi dạng
  **chuỗi số** (`"80000"`), không gửi `number` để tránh sai số.
- Ngày trả về dạng ISO-8601. Hiển thị theo định dạng Việt Nam `dd/MM/yyyy`.

## 4. Danh sách tài khoản seed (dùng để dev/test UI)

| Role | Email | Mật khẩu |
| --- | --- | --- |
| SUPER_ADMIN | admin@kimdong.edu.vn | Admin@123456 |
| ACCOUNTANT | ketoan@kimdong.edu.vn | KeToan@123456 |
| CASHIER | thuquy@kimdong.edu.vn | ThuQuy@123456 |

Trường mẫu: **Trường Tiểu Học Kim Đồng** (mã `KIMDONG`), năm học `2026-2027`,
lớp `1A1/1A2/1A3`, khoản thu mẫu "Kỹ năng sống" 80.000đ x 9 tháng.

## 5. Danh sách màn hình / luồng nghiệp vụ cần xây

### 5.1. Auth
- `/login` — form email + password, hiển thị lỗi `INVALID_CREDENTIALS`/`USER_INACTIVE` rõ ràng.

### 5.2. Dashboard (`/`)
- Thẻ số liệu tổng quan: `GET /dashboard/summary` (tổng phải thu, đã thu, còn
  phải thu, tỷ lệ thu %, số HS đã/chưa/một phần đóng, giao dịch hôm nay, tiền
  hôm nay).
- Biểu đồ doanh thu theo ngày: `GET /dashboard/revenue-by-day?days=30`.
- Biểu đồ doanh thu theo tháng: `GET /dashboard/revenue-by-month?months=12`.
- Bảng/biểu đồ theo lớp: `GET /dashboard/by-class`.
- Bảng/biểu đồ theo khoản thu: `GET /dashboard/by-fee-category`.
- Filter theo `schoolId`, `academicYearId` (SUPER_ADMIN/ADMIN thấy chọn
  trường; ACCOUNTANT/CASHIER mặc định theo `schoolId` của chính họ).

### 5.3. Danh mục (Schools / Academic Years / Semesters / Classes)
- `/schools` — list, create, edit, (xoá SUPER_ADMIN). Form gồm thông tin ngân
  hàng (`bankName`, `bankCode`, `bankAccountNumber`, `bankAccountName`) — đây
  là tài khoản QR sẽ hiển thị cho phụ huynh, cần UI rõ ràng, cảnh báo khi bỏ trống.
- `/academic-years` — list theo trường, create/edit, trạng thái
  `DRAFT/ACTIVE/CLOSED` hiển thị badge màu.
- `/semesters` — tương tự, thuộc 1 academic year.
- `/classes` — list theo trường + năm học, create/edit, xem danh sách học sinh
  trong lớp (`GET /classes/:id/students`).

### 5.4. Học sinh (`/students`)
- Danh sách: search theo tên/mã HS, filter theo lớp/trạng thái, **ẩn/che bớt
  `identifierCode` nếu role không phải SUPER_ADMIN/ADMIN/ACCOUNTANT** (backend
  đã tự che, FE chỉ cần hiển thị đúng field trả về, không tự ý unmask).
- Chi tiết học sinh: thông tin cơ bản, tab "Công nợ" (`GET
  /students/:id/receivables`), tab "Sổ công nợ" (`GET /students/:id/ledger` —
  render dạng bảng Ngày/Nội dung/Nợ/Có/Số dư giống sổ kế toán thật), tab "Số dư
  có" (`GET /students/:id/credits`).
- Tạo/sửa học sinh, gán vào lớp (`POST /student-classes/assign`).

### 5.5. Khoản thu (Fee Categories / Fee Plans / Fee Assignment)
- `/fee-categories` — CRUD danh mục.
- `/fee-plans` — list, create (billingType `ONE_TIME`/`MONTHLY`/`CUSTOM`,
  `unitPrice`, `quantity` → hiển thị `defaultAmount` tính sẵn = unitPrice ×
  quantity để kế toán xem trước), edit, kích hoạt (chuyển status `ACTIVE`).
- Màn "Gán khoản thu" (`POST /fee-plans/:id/assign`): chọn `targetType`
  (SCHOOL/GRADE/CLASS/STUDENT) → hiện selector tương ứng (multi-select lớp,
  hoặc chọn khối, hoặc chọn danh sách học sinh). Sau khi gán, hiển thị kết quả
  `{ targetedStudents, receivablesCreated, receivablesSkipped }` rõ ràng (số bị
  skip nghĩa là học sinh đã có công nợ này rồi — không phải lỗi).

### 5.6. Công nợ (`/receivables`)
- Danh sách: filter theo trường/năm học/học kỳ/lớp/học sinh/danh mục/trạng
  thái, cột: Mã công nợ, HS, Khoản thu, Phải thu, Đã thu, Còn nợ, Trạng thái
  (badge màu theo `UNPAID/PARTIALLY_PAID/PAID/OVERDUE/CANCELLED`).
- Chi tiết công nợ: hiển thị đầy đủ `originalAmount / discountAmount /
  adjustmentAmount / amountDue / amountPaid / amountOutstanding`, danh sách
  miễn giảm đã áp (`GET /receivables/:id/discount`) và điều chỉnh đã áp (`GET
  /receivables/:id/adjustments`).
- Dialog "Miễn giảm" (`POST /receivables/:id/discount`): chọn loại
  `FIXED_AMOUNT`/`PERCENTAGE`, nhập `value`, `reason` bắt buộc.
- Dialog "Điều chỉnh" (`POST /receivables/:id/adjustments`): chọn
  `INCREASE`/`DECREASE`, `amount`, `reason` bắt buộc.

### 5.7. Thanh toán QR động
- Từ trang chi tiết học sinh hoặc công nợ: nút "Tạo yêu cầu thanh toán" →
  chọn 1 hoặc nhiều khoản công nợ (mỗi dòng cho phép sửa số tiền thanh toán,
  mặc định = còn nợ) → `POST /payment-orders`.
- Trang "Yêu cầu thanh toán" (`/payment-orders/:id`): hiển thị mã đơn
  (`orderCode`), tổng tiền, trạng thái, đếm ngược `expiresAt`. Hiển thị QR
  bằng `GET /payment-orders/:id/qr` → dùng trực tiếp `qrUrl` (ảnh QR) làm
  `<img>`, không tự vẽ QR ở FE. Poll trạng thái đơn mỗi vài giây (hoặc dùng
  React Query `refetchInterval`) để tự cập nhật khi đã thanh toán.
- Với `paymentMethod = CASH`: form "Ghi nhận thu tiền mặt" cho CASHIER, gọi
  `POST /payment-transactions/manual` với `externalTransactionId` (tự sinh vd.
  `CASH-<orderCode>-<timestamp>`), `amount`, `transferContent = orderCode`.

### 5.8. Giao dịch & Đối soát
- `/payment-transactions` — danh sách giao dịch đã nhận, filter theo trạng
  thái (`RECEIVED/MATCHED/UNMATCHED/ALLOCATED/REVERSED`).
- `/reconciliation` — tab "Chưa khớp" (`GET /reconciliation/unmatched`): với
  mỗi giao dịch, cho kế toán chọn 1 Payment Order để khớp thủ công (`POST
  /reconciliation/:transactionId/match`) hoặc xem chi tiết để nhập lý do và
  huỷ khớp một giao dịch đã khớp sai (`POST /reconciliation/:transactionId/unmatch`,
  yêu cầu `reason` bắt buộc, có dialog xác nhận vì đây là thao tác đảo tiền).

### 5.9. Phiếu thu (`/receipts`)
- Danh sách, filter theo học sinh/trạng thái. Chi tiết phiếu thu: các dòng
  (`items`), tổng tiền, có nút "In phiếu thu" (dùng `window.print()` với CSS
  `@media print` riêng, không cần thư viện PDF ngoài trừ khi được yêu cầu).
- Huỷ phiếu thu (`PATCH /receipts/:id/cancel`, yêu cầu `reason`, dialog xác
  nhận rõ ràng đây là thao tác không đảo ngược được qua UI).

### 5.10. Hoàn tiền (`/refunds`)
- Danh sách, tạo mới (`POST /refunds`): chọn `paymentTransactionId` (chỉ nên
  cho chọn giao dịch có số dư có > 0 — có thể check qua `GET
  /students/:id/credits` trước khi mở form), `amount`, `reason`.

### 5.11. Import Excel (`/imports`)
- Wizard 2 bước bắt buộc, **không cho import thẳng**:
  1. Upload file + chọn `schoolId`, `academicYearId`, `feePlanId` (bắt buộc
     trừ khi import loại STUDENTS), loại import (`STUDENTS`/`RECEIVABLES`/`COMBINED`)
     → `POST /imports/excel/preview` (multipart/form-data field `file`).
  2. Hiển thị bảng kết quả preview: `totalRows/validRows/invalidRows`, bảng
     lỗi chi tiết (sheet/row/column/field/value/message) — highlight rõ dòng
     lỗi. Nếu `validRows > 0`, cho phép bấm "Xác nhận import" →
     `POST /imports/excel/confirm` với `importSessionId`. Hiển thị kết quả
     (`studentsCreated/studentsMatched/receivablesCreated/receivablesSkipped`).

### 5.12. Export Excel
- Nút "Xuất Excel" ở các trang danh sách công nợ/giao dịch/lớp, gọi trực tiếp
  `GET /exports/receivables.xlsx`, `/exports/payments.xlsx`,
  `/exports/debt-report.xlsx`, `/exports/class/:id.xlsx` (kèm filter hiện tại
  trên URL) — dùng `<a href>` hoặc `window.location` để trình duyệt tự tải
  file (backend trả `Content-Disposition: attachment`), không cần xử lý blob
  thủ công trừ khi cần gắn header Authorization (khi đó dùng `axios` với
  `responseType: 'blob'` rồi tạo `URL.createObjectURL`).

### 5.13. Báo cáo (`/reports`)
- `/reports/receivables` — bộ lọc đầy đủ (trường/năm học/học kỳ/lớp/học
  sinh/danh mục/trạng thái/khoảng ngày), hiển thị summary cards + bảng chi
  tiết phân trang (`GET /reports/receivables`).
- `/reports/classes/:id` — báo cáo theo lớp, sĩ số, tổng phải thu/đã thu/còn
  nợ, tỷ lệ thu, bảng từng học sinh.

### 5.14. Quản trị người dùng (`/users`)
- SUPER_ADMIN/ADMIN tạo tài khoản mới (`POST /users`), chọn role, gán
  `schoolId` (bỏ trống nếu SUPER_ADMIN/ADMIN quản lý nhiều trường).

### 5.15. Nhật ký hệ thống (`/audit-logs`)
- Bảng log filter theo `entityType`, `entityId`, `userId`, hiển thị
  `action`, `oldData`/`newData` dạng JSON thu gọn (collapsible).

## 6. Validation phía client (Zod) — khớp đúng rule backend

- Email: định dạng email, password đăng nhập không giới hạn độ dài tối thiểu
  (chỉ bắt buộc nhập); password khi **tạo user** tối thiểu 8 ký tự.
- Các trường tiền (`unitPrice`, `quantity`, `value`, `amount`...): bắt buộc là
  chuỗi số hợp lệ, > 0 (trừ trường hợp cho phép 0 thì nói rõ trong form).
  `PERCENTAGE` discount: `value` trong khoảng 0–100.
- `reason` của discount/adjustment/refund/unmatch/cancel-receipt: bắt buộc,
  tối thiểu vài ký tự — đây là lý do sẽ lưu vĩnh viễn vào chứng từ, KHÔNG cho
  submit rỗng.
- UUID fields: validate đúng định dạng UUID trước khi gọi API để tránh lỗi
  400 vô nghĩa.

## 7. Yêu cầu chất lượng & cấu trúc

- Tổ chức thư mục theo tính năng (feature-based), mỗi module BE tương ứng 1
  thư mục FE: `features/students`, `features/receivables`,
  `features/payment-orders`, `features/reconciliation`, v.v. Mỗi feature có:
  `api.ts` (hàm gọi axios + types khớp DTO backend), `hooks.ts` (React Query
  hooks), `components/`.
- 1 file `lib/api-client.ts` duy nhất chứa axios instance + interceptor.
- 1 file `lib/error-messages.ts` map `ErrorCode` → thông điệp tiếng Việt hiển
  thị cho người dùng cuối.
- Loading state: dùng skeleton (shadcn `Skeleton`), không dùng spinner toàn
  trang trừ lần load đầu.
- Empty state: mọi bảng danh sách phải có empty state rõ ràng khi không có dữ
  liệu, không hiển thị bảng trống trơn.
- Mọi thao tác ghi (create/update/delete/action tài chính) phải có
  `toast.success`/`toast.error` sau khi mutation hoàn tất, và invalidate đúng
  React Query key liên quan (vd. sau khi miễn giảm → invalidate cả
  receivable detail lẫn student ledger).
- Thao tác không đảo ngược được từ UI (huỷ phiếu thu, unmatch, xoá) **bắt
  buộc** có `AlertDialog` xác nhận, nêu rõ hậu quả.
- Không được tự bịa thêm field không có trong response thực tế của backend.
  Nếu cần field mới, dừng lại và hỏi thay vì tự chế mock data.
- README của FE phải có: cách chạy (`npm install && npm run dev`), biến môi
  trường (`NEXT_PUBLIC_API_URL=http://localhost:3010`), tài khoản test.

## 8. Kế hoạch triển khai theo giai đoạn

1. **Phase 1**: setup Next.js + Tailwind + shadcn + React Query, axios client,
   auth flow (login/logout/refresh), layout khung (sidebar theo role, header,
   route guard), trang login hoạt động thật với tài khoản seed.
2. **Phase 2**: Schools/AcademicYears/Semesters/Classes/Students +
   StudentClasses — CRUD hoàn chỉnh, DataTable dùng chung.
3. **Phase 3**: FeeCategories/FeePlans/FeeAssignment, Receivables (list +
   detail + discount + adjustment), trang Sổ công nợ học sinh.
4. **Phase 4**: PaymentOrders + hiển thị QR + trạng thái realtime,
   PaymentTransactions, ghi nhận tiền mặt (manual), Reconciliation
   (match/unmatch).
5. **Phase 5**: Receipts (+ in phiếu thu), Refunds.
6. **Phase 6**: Imports (wizard preview/confirm), Exports, Reports, Dashboard
   (biểu đồ).
7. **Phase 7**: Users, Audit Logs, polish UX (responsive, dark mode nếu có
   thời gian), rà soát lại toàn bộ phân quyền hiển thị theo bảng mục 3.4.

Sau mỗi phase: chạy `npm run build` + `npm run lint`, kiểm thử thủ công bằng
tài khoản seed thật (không chuyển phase khi build lỗi), rồi mới sang phase kế.

---

**Ghi chú khi bắt đầu phiên mới**: hãy mở `http://localhost:3010/api/docs`
(cần backend đang chạy — `npm run start:dev` tại `F:\school-fee-payment-be`)
và đối chiếu từng DTO trước khi code phần tương ứng, vì đây là hợp đồng chính
xác nhất, ưu tiên hơn cả mô tả bằng lời trong prompt này nếu có sai khác.
