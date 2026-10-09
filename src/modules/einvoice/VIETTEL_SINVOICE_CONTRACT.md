# Viettel S-Invoice v2.44 contract

Nguồn triển khai là contract fallback do chủ dự án cung cấp. Base URL được normalize từ
`VIETTEL_SINVOICE_BASE_URL`; không endpoint nghiệp vụ nào hard-code full URL. Authentication hỗ trợ
Basic Auth hoặc `POST https://api-vinvoice.viettel.vn/auth/login` qua cấu hình
`VIETTEL_SINVOICE_AUTH_URL`, sau đó gửi `Cookie: access_token=<TOKEN>`.

| Mục  | Chức năng                     | Method    | Relative URL                                                               | Content-Type | Request/response chính                        | Service method                                               |
| ---- | ----------------------------- | --------- | -------------------------------------------------------------------------- | ------------ | --------------------------------------------- | ------------------------------------------------------------ |
| 7.2  | Phát hành/thay thế/điều chỉnh | POST      | `InvoiceAPI/InvoiceWS/createInvoice/{supplierTaxCode}`                     | JSON         | Invoice payload / issue result                | `issueInvoice`, `replaceInvoice`, `adjustInvoice`            |
| 7.3  | File hóa đơn                  | POST      | `InvoiceAPI/InvoiceUtilsWS/getInvoiceRepresentationFile`                   | JSON         | Invoice identity + PDF/ZIP / filename + bytes | `getInvoiceRepresentationFile`                               |
| 7.4  | File có mã bí mật             | POST      | `InvoiceAPI/InvoiceUtilsWS/getInvoiceFilePortal`                           | Form         | Portal file params / bytes                    | `getInvoiceFilePortal`                                       |
| 7.5  | File chuyển đổi               | POST      | `InvoiceAPI/InvoiceWS/createExchangeInvoiceFile`                           | Form         | Exchange params / PDF bytes                   | `createExchangeInvoiceFile`                                  |
| 7.6  | Tra cứu                       | POST      | `InvoiceAPI/InvoiceUtilsWS/getInvoices/{supplierTaxCode}`                  | JSON         | Search filters / invoices                     | `searchInvoices`                                             |
| 7.7  | Trường động                   | GET       | `InvoiceAPI/InvoiceWS/getCustomFields`                                     | Query        | taxCode, templateCode / fields                | `getCustomFields`                                            |
| 7.8  | Hóa đơn nháp                  | POST      | `InvoiceAPI/InvoiceWS/createOrUpdateInvoiceDraft/{supplierTaxCode}`        | JSON         | Invoice payload / result                      | `createOrUpdateInvoiceDraft`                                 |
| 7.9  | Hủy hóa đơn                   | POST      | `InvoiceAPI/InvoiceWS/cancelTransactionInvoice`                            | Form         | Cancel params / status                        | `cancelInvoice`                                              |
| 7.10 | Kê khai thuế                  | POST      | `InvoiceAPI/InvoiceUtilsWS/updateTaxDeclaration/`                          | JSON         | tax code + issue date / status                | `updateTaxDeclaration`                                       |
| 7.11 | Tình hình sử dụng theo dải    | POST      | `InvoiceAPI/InvoiceUtilsWS/getProvidesStatusUsingInvoice`                  | JSON         | tax/template/serial / usage                   | `getInvoiceUsageRange`                                       |
| 7.12 | Phát hành theo lô             | POST      | `InvoiceAPI/InvoiceWS/createBatchInvoice/{supplierTaxCode}`                | JSON         | Max 50 original HSM invoices / batch result   | `createBatchInvoice`                                         |
| 7.13 | Danh sách theo thời gian      | POST      | `InvoiceAPI/InvoiceUtilsWS/getListInvoiceDataControl`                      | JSON         | Date range / invoices                         | `getInvoicesByDateRange`                                     |
| 7.14 | Gửi email                     | POST      | `InvoiceAPI/InvoiceUtilsWS/sendHtmlMailProcess`                            | JSON         | tax code + UUID list / status                 | `sendHtmlMailProcess`                                        |
| 7.15 | USB lấy hash                  | POST      | `InvoiceAPI/InvoiceWS/createInvoiceUsbTokenGetHash/{supplierTaxCode}`      | JSON         | Invoice payload / hash                        | `getUsbTokenHash`                                            |
| 7.16 | USB gửi chữ ký                | POST      | `InvoiceAPI/InvoiceWS/createInvoiceUsbTokenInsertSignature`                | JSON         | Hash + signature / issue result               | `submitUsbTokenSignature`                                    |
| 7.17 | Chuyển font                   | POST      | `InvoiceAPI/InvoiceUtilsWS/convertFont`                                    | JSON         | Font + data / Unicode                         | `convertFont`                                                |
| 7.18 | Cập nhật thanh toán           | POST      | `InvoiceAPI/InvoiceWS/updatePaymentStatus`                                 | Form         | Payment status params / status                | `updatePaymentStatus`                                        |
| 7.19 | Hủy thanh toán                | POST      | `InvoiceAPI/InvoiceWS/cancelPaymentStatus`                                 | Form         | Invoice identity / status                     | `cancelPaymentStatus`                                        |
| 7.20 | Xem trước nháp                | POST      | `InvoiceAPI/InvoiceUtilsWS/createInvoiceDraftPreview/{supplierTaxCode}`    | JSON         | Invoice payload / PDF bytes                   | `previewInvoiceDraft`                                        |
| 7.21 | Tra cứu UUID                  | POST      | `InvoiceAPI/InvoiceWS/searchInvoiceByTransactionUuid`                      | Form         | tax code + UUID / invoice result              | `findByTransactionUuid`                                      |
| 7.22 | Cấp mã bí mật                 | POST      | `InvoiceAPI/BotWS/getReservationCode/{taxCode}`                            | JSON         | Request code / reservation codes              | `getReservationCodes`                                        |
| 7.23 | Trạng thái in                 | PUT       | `InvoiceAPI/InvoiceUtilsWS/updateInvoicePrintStatus`                       | JSON         | Invoice identity + status / result            | `updateInvoicePrintStatus`                                   |
| 7.24 | Lần quét QR                   | PUT       | `InvoiceAPI/InvoiceUtilsWS/updateInvoiceScanQrcode`                        | JSON         | Invoice identity / remaining scans            | `updateInvoiceScanQrcode`                                    |
| 7.25 | Thống kê user                 | GET       | `InvoiceAPI/InvoiceWS/getInvoiceUsage`                                     | Query        | Usage filters / totals                        | `getInvoiceUsage`                                            |
| 7.26 | Giải trình                    | PUT       | `InvoiceWS/update-explanation`                                             | JSON         | Invoice identity + reason / status            | `updateInvoiceExplanation`                                   |
| 7.27 | Phát hành mã bí mật server    | Config    | `InvoiceAPI/BotWS/createInvoiceWithCode/{taxCode}`                         | JSON         | Invoice + reservation code / issue result     | `createInvoiceWithReservationCode`                           |
| 7.28 | Mã bí mật USB                 | POST/POST | Endpoints 7.15 + 7.16                                                      | JSON         | Hash/sign flow                                | `getSecretInvoiceUsbHash`, `createSecretInvoiceUsbSignature` |
| 7.29 | Mẫu/ký hiệu                   | Config    | `InvoiceAPI/InvoiceUtilsWS/getAllInvoiceTemplates`                         | JSON         | taxCode + invoiceType / templates             | `getAllInvoiceTemplates`                                     |
| 7.30 | Cloud CA lấy hash             | POST      | Endpoint 7.15                                                              | JSON         | Invoice payload / hash                        | `getCloudCaHash`                                             |
| 7.31 | Cloud CA gửi chữ ký           | POST      | Endpoint 7.16                                                              | JSON         | Hash + signature / issue result               | `submitCloudCaSignature`                                     |
| 7.32 | Mã bí mật Cloud CA            | POST/POST | Endpoints 7.15 + 7.16                                                      | JSON         | Hash/sign flow                                | `getSecretInvoiceCloudCaHash`, `createSecretInvoiceCloudCa`  |
| 7.33 | Email do caller chỉ định      | POST      | `InvoiceAPI/InvoiceUtilsWS/sendEmailToCustomer`                            | JSON         | tax code + UUID + email / status              | `sendEmailToCustomer`                                        |
| 7.34 | Nháp xăng dầu                 | POST      | `InvoiceAPI/InvoiceWS/createOrUpdateInvoiceDraftForFuel/{supplierTaxCode}` | JSON         | Fuel invoice payload / result                 | `createFuelInvoiceDraft`                                     |
| 7.35 | Tra cứu kèm hàng hóa          | Config    | `InvoiceAPI/InvoiceUtilsWS/getAllInvoices/{supplierTaxCode}`               | JSON         | Search input / invoices + products            | `getInvoicesWithProducts`                                    |
| 7.36 | Gửi CQT                       | POST      | `InvoiceAPI/InvoiceWS/sendInvoiceByTransactionUuid`                        | Form         | UUID + date range / totals                    | `sendInvoiceToTaxAuthority`                                  |
| 7.37 | Tra cứu hàng hóa UTC+7        | Config    | `InvoiceAPI/InvoiceUtilsWS/getInvoicesAll/{supplierTaxCode}`               | JSON         | Search input / invoices + products            | `getInvoicesWithProductsUtc7`                                |

## VERIFY_VIETTEL

- 7.23 nằm dưới heading sai trong tài liệu; code dùng vị trí logic 7.23.
- 7.26 cố ý giữ đường dẫn thiếu prefix `InvoiceAPI/`.
- Method của 7.27, 7.29, 7.35 và 7.37 không được tài liệu xác định. Chúng chỉ chạy khi biến
  `VIETTEL_SINVOICE_METHOD_*` tương ứng được cấu hình sau khi kiểm thử Viettel.
- 7.30/7.31 là Cloud CA nhưng Viettel vẫn dùng endpoint mang tên `UsbToken`.
- `invoiceNo=""` là trạng thái bất đồng bộ, không phải lỗi; worker gọi 7.21 theo backoff.

## Migration/rollout

1. Chạy migration `1789200000000-ViettelSinvoice` và `1789300000000-EInvoiceUniqueActivePayment`.
2. Khởi động Redis và mount volume `einvoice_files`.
3. Giữ `VIETTEL_SINVOICE_ENABLED=false` cho tới khi credential test được cấu hình.
4. Tạo `einvoice_configs` cho từng trường, đặc biệt tax percentage và chính sách giá gồm thuế.
5. Kiểm thử 7.2, 7.21, 7.3, 7.33, 7.9 trên môi trường Viettel test.
6. Bật từng trường; theo dõi `einvoice_attempts`/`einvoice_events` trước khi rollout toàn bộ.
