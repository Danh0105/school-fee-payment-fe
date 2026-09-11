# Prompt: Cập nhật FE cho "Kế hoạch thu" (Fee Plans) theo API mới

Copy toàn bộ nội dung dưới đây làm prompt cho phiên làm việc sửa Frontend (đây
là bản vá cho phần **Khoản thu** trong `FRONTEND_PROMPT.md` gốc, không phải
prompt dựng FE từ đầu — nếu FE chưa tồn tại, dùng `FRONTEND_PROMPT.md` trước).

---

## 1. Bối cảnh

Backend (`F:\school-fee-payment-be`) vừa đơn giản hoá màn "Tạo kế hoạch thu"
và sửa lại logic tính tiền cho đúng nghiệp vụ thật (học phí theo tháng, phụ
huynh có thể đóng cả năm hoặc theo học kỳ). API `POST /fee-plans` **đã đổi
contract** — cần sửa lại form tạo/sửa kế hoạch thu và màn "Gán khoản thu" cho
khớp. Đọc kỹ Swagger `http://localhost:3010/api/docs` mục `Fee Plans` trước
khi sửa code, vì đây vẫn là nguồn sự thật cuối cùng.

## 2. Form "Tạo kế hoạch thu" — chỉ còn 6 field

Bỏ hết: **Năm học, Học kỳ, Mã kế hoạch, Tên kế hoạch, Cách tính (billingType),
Ngày bắt đầu, Hạn thu** khỏi form tạo mới. Server tự lo toàn bộ các field này.

Form chỉ còn:

| Label hiển thị | Field API | Loại input | Bắt buộc |
| --- | --- | --- | --- |
| Trường | `schoolId` | select (danh sách trường) | có |
| Khoản thu | `feeCategoryId` | select (danh mục khoản thu của trường đã chọn) | có |
| Số lượng | `quantity` | number/text, **chuỗi số** (vd `"9"`) | có |
| Đơn giá | `unitPrice` | number/text, **chuỗi số** (vd `"80000"`) | có |
| Trạng thái | `status` | select `DRAFT`/`ACTIVE`/... | không (mặc định `DRAFT`) |
| Mô tả | `description` | textarea | không |

Payload gửi lên `POST /fee-plans`:

```json
{
  "schoolId": "uuid",
  "feeCategoryId": "uuid",
  "unitPrice": "80000",
  "quantity": "9",
  "description": "Ghi chú (tuỳ chọn)",
  "status": "ACTIVE"
}
```

**Ý nghĩa của "Số lượng" — giải thích rõ trong UI (helper text dưới ô nhập)**:
- Đây là **tổng số tháng của cả năm học** (vd trường thu 9 tháng/năm → nhập
  `9`). Hệ thống tự tính "Thành tiền dự kiến cả năm" = Đơn giá × Số lượng để
  hiển thị preview ngay dưới ô (giống UI cũ, chỉ khác input không còn ở form —
  giờ tính từ 2 field Đơn giá/Số lượng có sẵn).
- Nhập `1` nếu là khoản thu **một lần** (phí ghi danh, đồng phục...) — hệ
  thống sẽ không chia học kỳ, chỉ tạo 1 công nợ duy nhất khi gán.
- Nhập `> 1` (vd `9`) nếu là khoản thu **theo năm/tháng** (học phí...) — hệ
  thống tự suy ra đây là khoản thu theo tháng và sẽ **tự chia đôi thành 2
  công nợ (Học kỳ 1 + Học kỳ 2)** khi gán cho học sinh (xem mục 4).

**Không có ô nào cho "Cách tính"/billingType** — server tự suy: Số lượng = 1
→ Thu một lần; Số lượng > 1 → Theo tháng.

## 3. Sau khi tạo — hiển thị lại, không cho sửa tay

Response của `POST /fee-plans` trả về đầy đủ:

```json
{
  "id": "uuid",
  "schoolId": "...",
  "academicYearId": "...",       // hệ thống tự lấy năm học hiện tại
  "feeCategoryId": "...",
  "code": "KNS-2627",             // hệ thống tự sinh: {mã khoản thu}-{năm học rút gọn}
  "name": "Kỹ năng sống năm học 2026-2027", // hệ thống tự sinh: "{Tên khoản thu} năm học {Năm học}"
  "billingType": "MONTHLY",
  "unitPrice": "80000.00",
  "quantity": "9.00",
  "defaultAmount": "720000.00",
  "status": "ACTIVE",
  ...
}
```

- Ở bảng danh sách `/fee-plans` và trang chi tiết: hiển thị `code`, `name`,
  `academicYearId` (resolve ra tên năm học để show), `billingType` như
  **read-only**, không có nút sửa riêng cho các field này (chưa có API PATCH
  cho `code`/`academicYearId`; `name`/`billingType`/`quantity` vẫn sửa được
  qua `PATCH /fee-plans/:id` nếu cần đính chính sau này — xem Swagger phần
  `UpdateFeePlanDto`, DTO update vẫn giữ đủ field cũ để đội kế toán sửa tay
  khi cần).
- Hiển thị badge "Thu một lần" nếu `billingType === 'ONE_TIME'`, "Theo tháng
  (chia học kỳ)" nếu `MONTHLY`.

## 4. Màn "Gán khoản thu" (`POST /fee-plans/:id/assign`) — số công nợ tạo ra có thể nhân đôi

Đây là thay đổi **quan trọng nhất về logic**, phải cập nhật cách hiển thị kết
quả:

- Nếu kế hoạch là **Thu một lần** (`billingType = ONE_TIME`): mỗi học sinh
  được gán → **1 công nợ**, y như trước.
- Nếu kế hoạch là **Theo tháng** (`billingType = MONTHLY`, tức Số lượng > 1
  lúc tạo): mỗi học sinh được gán → **2 công nợ** (1 cho Học kỳ 1, 1 cho Học
  kỳ 2), mỗi công nợ = nửa số lượng × đơn giá (vd 9 tháng × 80.000đ = 720.000đ
  → mỗi học kỳ 360.000đ). `description` của từng công nợ sẽ có hậu tố học kỳ,
  vd `"Kỹ năng sống năm học 2026-2027 - Học kỳ 1"`.

→ Response `{ targetedStudents, receivablesCreated, receivablesSkipped }`:
với kế hoạch MONTHLY, `receivablesCreated` **có thể lên tới 2 × targetedStudents**
(không phải lỗi nhân đôi). Sửa lại text hiển thị kết quả cho rõ, vd:

> "Đã gán cho **12** học sinh, tạo **24** công nợ (12 Học kỳ 1 + 12 Học kỳ 2),
> bỏ qua **0** (đã có công nợ trước đó)."

Nếu muốn chính xác tuyệt đối, có thể gọi thêm `GET /receivables?feePlanId=...`
sau khi assign để đếm/group theo `semesterId` thay vì tự suy đoán ở FE.

## 5. Ý nghĩa nghiệp vụ cho màn thanh toán (không đổi API, chỉ đổi cách dùng)

`POST /payment-orders` không đổi (vẫn nhận danh sách `receivableId` có sẵn),
nhưng giờ với khoản thu MONTHLY, học sinh sẽ có **2 công nợ riêng biệt** (HK1,
HK2) thay vì 1. Ở màn "Tạo yêu cầu thanh toán" (mục 5.7 trong
`FRONTEND_PROMPT.md`):

- Cho phụ huynh/thu ngân chọn **1 trong 2** công nợ học kỳ → hệ thống tự hiểu
  là "đóng theo học kỳ", công nợ còn lại vẫn nằm nguyên trạng thái
  `UNPAID`/công nợ chưa thu — **không cần thêm logic chia tiền ở FE**, vì mỗi
  công nợ đã là 1 nửa sẵn từ lúc tạo.
- Cho phép **chọn cả 2** (tick cả HK1 + HK2 cùng lúc, giống chọn nhiều công nợ
  bình thường) → tương đương "đóng cả năm" trong 1 lệnh thu.
- Gợi ý UX: ở trang công nợ học sinh, nhóm 2 dòng công nợ cùng `feePlanId`
  lại với nhau (vd dưới 1 card "Kỹ năng sống năm học 2026-2027" có 2 dòng con
  HK1/HK2), kèm 2 nút nhanh "Đóng HK1", "Đóng HK2", "Đóng cả năm" (chọn cả
  2 rồi mở thẳng dialog tạo yêu cầu thanh toán).

## 6. Việc cần làm (checklist)

1. Sửa Zod schema + React Hook Form của form tạo kế hoạch thu: bỏ
   `academicYearId, semesterId, code, name, billingType, startDate, dueDate`
   khỏi schema tạo mới; thêm lại `quantity` (string, số dương, bắt buộc).
2. Sửa API type/hook `useCreateFeePlan` (`features/fee-plans/api.ts`) khớp
   payload mới ở mục 2.
3. Cập nhật `UpdateFeePlanDto` type ở FE nếu có form sửa riêng — DTO update
   **không đổi**, vẫn còn `semesterId, name, description, billingType,
   unitPrice, quantity, startDate, dueDate, status`.
4. Cập nhật bảng/detail `/fee-plans` hiển thị `code`, `name`, `billingType`
   dạng badge read-only như mục 3.
5. Cập nhật màn "Gán khoản thu" hiển thị kết quả theo mục 4.
6. Cập nhật trang công nợ học sinh để nhóm HK1/HK2 theo `feePlanId` như gợi ý
   mục 5 (không bắt buộc phải làm ngay nếu thời gian gấp, nhưng nên báo lại
   nếu bỏ qua để backend biết FE tạm thời hiển thị 2 dòng công nợ rời rạc).
7. Build + lint FE, test lại luồng: tạo kế hoạch thu quantity=1 (kiểm tra chỉ
   tạo 1 công nợ khi gán) và quantity=9 (kiểm tra tạo đúng 2 công nợ HK1/HK2,
   mỗi công nợ = nửa tiền).

Nếu thấy field nào trong response thực tế của Swagger khác với mô tả ở đây —
**tin theo Swagger**, vì backend có thể đã cập nhật thêm sau khi viết prompt
này.
