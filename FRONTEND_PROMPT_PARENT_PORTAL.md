# Prompt: Cập nhật FE — toàn bộ thay đổi backend hôm nay (Kế hoạch thu + Cổng phụ huynh)

Copy toàn bộ nội dung dưới đây làm prompt cho phiên sửa Frontend. Đây là bản
tổng hợp **mọi thay đổi backend trong phiên làm việc hôm nay** tại
`F:\school-fee-payment-be`, gồm 2 phần độc lập:

- **Phần A** — đơn giản hoá "Kế hoạch thu" (đã có prompt chi tiết riêng, xem
  file `FRONTEND_PROMPT_FEE_PLAN_UPDATE.md` trong cùng thư mục — đọc file đó
  nếu FE quản trị (admin dashboard) chưa cập nhật phần này).
- **Phần B** — tính năng **hoàn toàn mới**: Cổng phụ huynh (Mini App Zalo),
  chưa có prompt nào trước đó, mô tả đầy đủ ở dưới.

Đọc Swagger `http://localhost:3010/api/docs` (mục `Fee Plans` và `Parent
Portal`) trước khi code — đây vẫn là nguồn sự thật cuối cùng nếu có sai khác.

---

## Phần A — Tóm tắt nhanh (chi tiết đầy đủ ở `FRONTEND_PROMPT_FEE_PLAN_UPDATE.md`)

1. Form "Tạo kế hoạch thu" chỉ còn 6 field: Trường, Khoản thu, **Số lượng**
   (số tháng cả năm — nhập `1` = thu một lần), Đơn giá, Trạng thái, Mô tả.
   `academicYearId`, `code`, `name`, `billingType`, ngày bắt đầu/hạn thu đều
   do server tự sinh, không còn gửi lên từ FE.
2. Khi gán khoản thu (`POST /fee-plans/:id/assign`) cho khoản thu **theo
   tháng** (Số lượng > 1 lúc tạo), mỗi học sinh nhận **2 công nợ** (Học kỳ 1
   + Học kỳ 2, mỗi bên nửa tiền) thay vì 1. `receivablesCreated` trong kết
   quả trả về có thể gấp đôi số học sinh — không phải lỗi.
3. Gợi ý UX: nhóm 2 công nợ cùng `feePlanId` lại, cho chọn 1 (đóng theo học
   kỳ) hoặc cả 2 (đóng cả năm) khi tạo yêu cầu thanh toán.

Nếu FE admin dashboard đã áp dụng phần A rồi thì bỏ qua, chỉ cần làm Phần B.

---

## Phần B — Cổng phụ huynh (Mini App Zalo hoặc web đơn giản)

### 1. Bối cảnh và mô hình xác thực

**Không có tài khoản/mật khẩu, không đăng nhập qua Zalo OAuth.** Phụ huynh
chỉ cần nhập **mã định danh (CCCD) của học sinh** để vào thẳng trang công nợ
của học sinh đó. Mỗi phiên chỉ gắn với **1 học sinh** — nếu phụ huynh có
nhiều con, phải nhập lại mã định danh của từng con để xem riêng từng học
sinh (không có khái niệm "tài khoản gia đình" gộp nhiều con).

Đây là thiết kế có chủ đích đơn giản hoá tối đa cho Mini App, đánh đổi lấy
việc **ai biết trường + mã định danh của học sinh là xem được công nợ và tạo
được yêu cầu thanh toán cho học sinh đó** — không cần hỏi lại, không có OTP.
Không tự ý thêm bước xác thực khác (OTP, mật khẩu...) nếu chưa được yêu cầu —
nhưng **nên áp dụng UX "không để lộ mã định danh dễ dàng"**: không hiển thị
đầy đủ mã định danh ở bất kỳ đâu ngoài input lúc nhập, không log ra console.

**Bắt buộc chọn Trường trước khi nhập mã định danh** — tra cứu được ràng
buộc theo cặp (trường, mã định danh) để tránh trùng mã giữa các trường khác
nhau (mã định danh không có ràng buộc unique toàn hệ thống). Không cần chọn
lớp — lớp có thể đổi theo năm học/học kỳ nên không dùng để lọc, chỉ hiển thị
sau khi tra cứu thành công.

### 2. API — danh sách trường (cho dropdown "Chọn trường")

```
GET /parent-auth/schools   (public, không cần token)

200 OK:
[
  { "id": "uuid", "name": "Trường Tiểu Học Kim Đồng", "code": "KIMDONG" },
  ...
]
```

Chỉ trả `id/name/code` — không có thông tin ngân hàng/quản lý (không cần và
không nên hiển thị ở màn public này).

### 3. API — luồng đăng nhập

```
POST /parent-auth/access
Body: { "schoolId": "uuid", "identifierCode": "0123456789012" }

200 OK:
{
  "accessToken": "<JWT>",
  "student": {
    "id": "uuid",
    "schoolId": "uuid",
    "school": { "id": "uuid", "name": "Trường Tiểu Học Kim Đồng", ... },
    "studentCode": "KIMDONG000000001",
    "identifierCode": "0123456789012",
    "fullName": "Nguyễn Văn A",
    "dateOfBirth": "2018-05-01",
    "parentName": "...",
    "parentPhone": "...",
    "status": "ACTIVE",
    ...
  }
}
```

Lỗi thường gặp: `STUDENT_IDENTIFIER_NOT_FOUND` (404) — "Không tìm thấy học
sinh với mã định danh này". Hiển thị lỗi ngay dưới ô nhập, **không tự đoán**
gợi ý sửa mã (không biết mã đúng là gì).

`accessToken` là JWT riêng cho cổng phụ huynh (khác hoàn toàn token nhân
viên), hạn dùng mặc định 30 ngày (`PARENT_JWT_EXPIRES_IN`, có thể đổi phía
backend). Lưu token này (localStorage/Zalo Mini App storage tuỳ nền tảng);
khi API trả `401` → xoá token, quay lại màn nhập mã định danh (coi như phiên
hết hạn, không cần thông báo "sai mật khẩu" vì không có khái niệm đó).

### 4. API — sau khi có `accessToken` (header `Authorization: Bearer <accessToken>`)

```
GET  /parent/me                        -> thông tin học sinh (như student ở trên)
GET  /parent/receivables               -> danh sách công nợ của đúng học sinh trong token
POST /parent/payment-orders            -> tạo yêu cầu thanh toán
GET  /parent/payment-orders/:id        -> chi tiết 1 yêu cầu thanh toán
GET  /parent/payment-orders/:id/qr     -> lấy QR + trạng thái
```

**Không có tham số `studentId`** trong bất kỳ endpoint nào ở trên — server tự
lấy từ token. Đặc biệt `POST /parent/payment-orders` **khác payload** với
API `POST /payment-orders` dùng cho nhân viên (không có field `studentId`):

```json
{
  "items": [
    { "receivableId": "uuid", "amount": "360000" }
  ],
  "paymentMethod": "VIETQR"
}
```

`items[].amount` là tuỳ chọn — bỏ trống thì mặc định = toàn bộ số còn nợ của
công nợ đó (`amountOutstanding`). `paymentMethod` tuỳ chọn, mặc định `VIETQR`.

Response của `POST /parent/payment-orders` và `GET /parent/payment-orders/:id`
giống hệt shape `PaymentOrder` đã dùng ở FE admin (mục 5.7 trong
`FRONTEND_PROMPT.md` gốc) — tái dùng lại type/parse logic đã có nếu FE admin
và Mini App dùng chung codebase/monorepo.

### 5. Màn hình cần xây

1. **`/` (màn vào cổng)** — dropdown "Chọn trường" (load từ `GET
   /parent-auth/schools` lúc mở màn) + 1 ô nhập "Mã định danh học sinh
   (CCCD)" + nút "Tra cứu". Nút "Tra cứu" disable tới khi đã chọn trường.
   Loading state khi gọi API, lỗi hiển thị inline. Thành công → lưu
   `accessToken` + điều hướng sang màn công nợ.
2. **`/receivables` (màn công nợ)** —
   - Header: tên học sinh, trường, lớp (nếu `GET /parent/me` có trả kèm lớp
     hiện tại — nếu chưa có, không tự bịa, hỏi lại backend).
   - Danh sách công nợ từ `GET /parent/receivables`, **nhóm theo
     `feePlanId`**: nếu 1 kế hoạch thu có 2 dòng công nợ (`semesterId` khác
     nhau, `HK1`/`HK2`) thì gộp hiển thị dưới 1 card có tên khoản thu, kèm 2
     dòng con "Học kỳ 1 — còn nợ X đ" / "Học kỳ 2 — còn nợ Y đ", mỗi dòng có
     checkbox chọn. Công nợ không có `semesterId` (khoản thu một lần) hiển
     thị như 1 dòng bình thường.
   - Nút nhanh trên mỗi card 2-học-kỳ: "Đóng HK1", "Đóng HK2", "Đóng cả năm"
     (tick sẵn tương ứng rồi cuộn xuống nút xác nhận, hoặc mở thẳng dialog).
   - Nút "Tạo yêu cầu thanh toán" ở cuối trang: gom mọi công nợ đã tick →
     `POST /parent/payment-orders`.
   - Trạng thái từng công nợ hiển thị badge màu theo
     `UNPAID/PARTIALLY_PAID/PAID/OVERDUE/CANCELLED` (dùng đúng enum backend
     trả về, không tự đặt tên khác).
3. **`/payment-orders/:id` (màn thanh toán)** —
   - Hiển thị mã đơn (`orderCode`), tổng tiền (`requestedAmount`), trạng
     thái (`status`), đếm ngược `expiresAt`.
   - QR: `GET /parent/payment-orders/:id/qr` → dùng `qrUrl` làm `<img>` trực
     tiếp, không tự vẽ QR.
   - Poll trạng thái đơn mỗi vài giây (hoặc dùng thư viện data-fetching có
     `refetchInterval`) để tự chuyển sang "Đã thanh toán" khi có kết quả.

### 6. Tiền tệ, mã lỗi — dùng chung quy ước với FE admin

- Tiền vẫn là chuỗi thập phân (`"360000.00"`), không parse bằng phép toán
  float thường — xem mục 3.5 trong `FRONTEND_PROMPT.md` gốc.
- Response envelope `{ success, data }` / `{ success: false, error: {code,
  message} }` giống hệt API nhân viên — dùng lại interceptor/`ApiError`
  pattern đã có nếu là cùng codebase; nếu Mini App là project riêng thì viết
  lại tương đương, đừng hard-code chuỗi tiếng Việt rải rác nhiều nơi.
- Mã lỗi mới cần biết: `STUDENT_IDENTIFIER_NOT_FOUND` (màn đăng nhập),
  `FORBIDDEN` (không nên xảy ra bình thường — nếu gặp, có nghĩa token cũ
  đang cố xem dữ liệu học sinh khác, đá về màn nhập mã định danh).

### 7. Việc cần làm (checklist)

1. Khởi tạo project Mini App Zalo (hoặc trang web riêng nếu chưa chốt dùng
   Mini App) — nếu dùng Zalo Mini App SDK, layout theo chuẩn Zalo (không bắt
   buộc Tailwind/shadcn như FE admin, tuỳ theo bộ UI Mini App hỗ trợ).
2. Trang chọn trường (`GET /parent-auth/schools`) + nhập mã định danh + lưu
   token + xử lý lỗi `STUDENT_IDENTIFIER_NOT_FOUND`.
3. Trang công nợ: gọi `GET /parent/receivables`, nhóm theo `feePlanId` +
   `semesterId` như mục 5.2, checkbox chọn nhiều công nợ.
4. Tạo yêu cầu thanh toán từ các công nợ đã chọn (`POST
   /parent/payment-orders`), điều hướng sang trang QR.
5. Trang QR + poll trạng thái.
6. Xử lý hết hạn token (401 → quay lại màn chọn trường/nhập mã định danh,
   không hiển thị lỗi kỹ thuật khó hiểu cho phụ huynh).
7. Build/lint, test thủ công với 1 trường + mã định danh có thật trong dữ
   liệu seed (`identifierCode` của học sinh mẫu trong `FRONTEND_PROMPT.md`
   gốc, hoặc hỏi backend một cặp trường/mã định danh test cụ thể nếu seed
   hiện tại chưa có sẵn).

Nếu response thực tế trên Swagger khác mô tả ở đây — tin theo Swagger, backend
có thể đã chỉnh thêm sau khi viết prompt này.
