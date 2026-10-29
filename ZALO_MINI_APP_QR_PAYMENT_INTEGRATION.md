# Tích hợp tạo mã thanh toán QR động (VietinBank) cho Zalo Mini App

Tài liệu này mô tả cách một AI/dev build Zalo Mini App (frontend riêng, không nằm trong repo này) tích hợp với các API đã có sẵn ở backend `school-fee-payment-fe` để hiển thị mã QR động cho phụ huynh quét thanh toán học phí qua VietinBank.

Backend **đã triển khai xong** toàn bộ logic sinh QR, ký/xác thực chữ ký, và callback đối soát — Mini App chỉ cần gọi 2 API và render kết quả. Không cần gọi thẳng VietinBank từ Mini App.

## 1. Luồng tổng quan

```
Phụ huynh mở Mini App
        │
        ▼
1. POST /payment-orders  (tạo đơn thanh toán cho 1+ khoản công nợ của học sinh)
        │  → trả về orderId, qrPayload, qrUrl, expiresAt
        ▼
2. Hiển thị mã QR (qrUrl) + nút "Mở app ngân hàng" (deeplink từ qrPayload nếu cần)
        │
        ▼
3. Poll GET /payment-orders/:id/qr  (hoặc /payment-orders/:id) mỗi vài giây
        │  → theo dõi field `status`
        ▼
4. status chuyển PENDING → PAID  ⇒ hiển thị thành công
   status chuyển PENDING → EXPIRED ⇒ cho phép tạo lại đơn (bước 1)
```

Việc đối soát tiền về thực tế do backend tự xử lý qua callback `notify-bill` từ VietinBank ([viettinbank.controller.ts](src/viettinbank/viettinbank.controller.ts)) — Mini App không tham gia bước này, chỉ polling để cập nhật UI.

## 2. API tạo đơn thanh toán (sinh QR động)

`POST /payment-orders`

**Auth:** Bearer token (phụ huynh phải đăng nhập; role liên quan tới `AccessControlService`).

**Request body** ([create-payment-order.dto.ts](src/payment-orders/dto/create-payment-order.dto.ts)):

```json
{
  "studentId": "uuid-cua-hoc-sinh",
  "items": [
    { "receivableId": "uuid-khoan-cong-no", "amount": "500000" }
  ],
  "paymentMethod": "VIETINBANK"
}
```

- `items[].amount` optional — nếu bỏ trống sẽ lấy toàn bộ số tiền còn nợ (`amountOutstanding`) của khoản đó.
- `paymentMethod`: bắt buộc truyền `"VIETINBANK"` để đi qua nhánh sinh QR động qua VietinBank (mặc định nếu bỏ trống là `VIETQR`, dùng ảnh QR tĩnh dựng từ số tài khoản trường, không phải QR động ngân hàng phát hành).

**Response (trích các field liên quan QR):**

```json
{
  "id": "order-uuid",
  "orderCode": "PAY26092200001",
  "requestedAmount": "500000",
  "status": "PENDING",
  "paymentMethod": "VIETINBANK",
  "qrPayload": "00020101021238570010A00000072701...",
  "qrUrl": "https://img.vietqr.io/image/970415-...-compact2.png?amount=500000&addInfo=...",
  "expiresAt": "2026-09-22T09:00:00.000Z",
  "transferContent": "260922000001"
}
```

- `qrUrl`: ảnh QR render sẵn (PNG qua img.vietqr.io) — dùng trực tiếp làm `src` cho `<Image>` trong Mini App, cách đơn giản nhất.
- `qrPayload`: chuỗi EMV/VietQR thô (đã decode từ base64 VietinBank trả về) — dùng nếu Mini App tự vẽ QR bằng thư viện client (ví dụ để custom style, logo) hoặc để tạo deeplink mở app ngân hàng.
- `expiresAt`: hạn sử dụng mã QR — hết hạn phải gọi lại `POST /payment-orders` để tạo đơn mới (không có API "refresh QR" riêng).

**Lỗi thường gặp:**
- Khoản công nợ đã `CANCELLED`/`PAID` → 400 `RECEIVABLE_CANCELLED` / `RECEIVABLE_ALREADY_PAID`.
- `amount` vượt quá `amountOutstanding` hoặc ≤ 0 → 400 `PAYMENT_AMOUNT_INVALID`.

## 3. API theo dõi trạng thái thanh toán (polling)

`GET /payment-orders/:id/qr`

**Auth:** Bearer token, cùng điều kiện quyền truy cập trường (`AccessControlService.assertSchoolAccess`).

**Response:**

```json
{
  "qrPayload": "00020101...",
  "qrUrl": "https://img.vietqr.io/...",
  "expiresAt": "2026-09-22T09:00:00.000Z",
  "status": "PENDING"
}
```

`status` là một trong ([status.enum.ts](src/common/enums/status.enum.ts)):

| status | Ý nghĩa UI |
| --- | --- |
| `PENDING` | Đang chờ quét/chuyển khoản — tiếp tục polling |
| `PARTIALLY_PAID` | Đã thanh toán một phần — hiển thị số tiền còn thiếu, có thể vẫn cho quét tiếp cùng QR |
| `PAID` | Thanh toán thành công — dừng polling, hiển thị màn hình thành công |
| `EXPIRED` | Hết hạn — dừng polling, hiển thị nút "Tạo lại mã QR" (gọi lại bước 1) |
| `CANCELLED` / `FAILED` | Dừng polling, hiển thị lỗi |

Gọi API này cũng tự động chuyển đơn `PENDING` quá `expiresAt` thành `EXPIRED` phía server (side-effect của chính lần gọi), nên không cần logic hết hạn riêng ở client — chỉ cần so sánh `expiresAt` với thời gian hiện tại để tắt polling sớm hơn nếu muốn UX mượt hơn.

Nếu cần thông tin đầy đủ hơn (số tiền đã thanh toán, danh sách item), dùng `GET /payment-orders/:id`.

## 4. Gợi ý triển khai phía Mini App (Zalo)

**Polling:**
- Interval đề xuất: 3–5 giây, dừng khi `status !== 'PENDING' && status !== 'PARTIALLY_PAID'` hoặc khi vượt `expiresAt`.
- Dừng polling khi user rời màn hình (Mini App bị ẩn/unmount) để tránh gọi API thừa.
- Không cần WebSocket/SSE — backend hiện chưa expose realtime push cho luồng này, chỉ hỗ trợ polling.

**Hiển thị QR:**
- Ưu tiên `qrUrl` (ảnh PNG có sẵn) cho tốc độ triển khai.
- Nếu cần mở thẳng app ngân hàng qua deeplink Zalo Mini App (`zaloapp://` hoặc scheme ngân hàng), parse `qrPayload` (chuẩn EMVCo) — VietinBank hiện không trả deeplink riêng, chỉ trả payload QR chuẩn NAPAS.

**Idempotency / tránh tạo trùng đơn:**
- Trước khi gọi `POST /payment-orders`, Mini App nên kiểm tra xem học sinh đã có đơn `PENDING` chưa hết hạn cho đúng (các) khoản công nợ đó chưa (qua `GET /payment-orders?...` nếu có endpoint danh sách, hoặc lưu `orderId` gần nhất ở local state) để tránh sinh nhiều mã QR cho cùng một khoản phí. Backend hiện **không** tự chặn tạo trùng đơn ở tầng service — trách nhiệm này đang ở phía client.

**Xử lý hết hạn:**
- Khi `status === 'EXPIRED'`, gọi lại `POST /payment-orders` với cùng `items` để lấy `qrUrl`/`qrPayload` mới — không có API "extend"/"refresh" mã cũ.

## 5. Những gì Mini App KHÔNG cần làm

- Không cần tự gọi VietinBank API, không cần xử lý chữ ký RSA — toàn bộ nằm ở [ViettinbankApiService](src/viettinbank/viettinbank-api.service.ts) và [ViettinbankProvider](src/payment-providers/providers/viettinbank.provider.ts) phía backend.
- Không cần implement endpoint nhận callback — VietinBank gọi thẳng `notify-bill` về backend, backend tự cập nhật `status` của đơn.

## 6. Tham chiếu code liên quan

- [payment-orders.controller.ts](src/payment-orders/payment-orders.controller.ts) — `POST /payment-orders`, `GET /payment-orders/:id`, `GET /payment-orders/:id/qr`.
- [payment-orders.service.ts](src/payment-orders/payment-orders.service.ts) — logic sinh QR theo `paymentMethod`, tính `expiresAt`.
- [viettinbank.provider.ts](src/payment-providers/providers/viettinbank.provider.ts) — gọi VietinBank sinh QR, verify webhook, parse giao dịch.
- [viettinbank.controller.ts](src/viettinbank/viettinbank.controller.ts) — endpoint `inq-bill`/`notify-bill` VietinBank gọi vào để xác nhận thanh toán.
- [src/viettinbank/README.md](src/viettinbank/README.md) — tổng quan module VietinBank, cấu hình env.
