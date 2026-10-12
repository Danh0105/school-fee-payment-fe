# Runbook: deploy hóa đơn điện tử Viettel S-Invoice

Áp dụng cho VPS hiện tại (cập nhật 12/10/2026).

| | Repo | Nhánh / commit | Chạy ở đâu trên VPS |
|---|---|---|---|
| Backend NestJS | `Danh0105/school-fee-payment-fe` | `feat/einvoice-viettel` (`57c4678` + runbook) | Docker, thư mục `/opt/school-fee-payment-be`, API `127.0.0.1:3030` |
| Frontend Next.js | `Danh0105/school-fee-payment-be` | `feat/einvoice-viettel` (`cab8708`) | pm2 `school-fee-payment-fe`, thư mục `/var/www/school-fee-payment-be`, cổng `3031` |

> Tên repo/thư mục bị đặt ngược: repo/thư mục có chữ **`-fe`** là **backend**, có chữ **`-be`** là **frontend**.

Trước deploy, production chạy đúng HEAD `master` của cả hai repo (BE `af4a987`, FE `5f2b851`, cùng build ngày 22/09). Deploy nhánh này chỉ thêm phần hóa đơn điện tử.

## Trạng thái và quyết định (12/10/2026)

| Mục | Trạng thái |
|---|---|
| Giai đoạn A | **Xong 09/10.** A1–A6 lúc 14:25–14:27 (backup ở `/root/backups/einvoice-20261009-1425/`, image cũ tag `pre-einvoice`); A7 build FE lúc 16:35; route `/einvoices`, `/einvoices/settings` có trong bản build. Tích hợp vẫn **tắt**. |
| Giai đoạn B | **Không có môi trường test Viettel**: tài khoản được cấp là tài khoản production của ICHI SKILL. Thay bằng kiểm tra **không phát hành** (09/10, dùng chính code module): đăng nhập OK; xem trước 7.20 với payload của mapper được Viettel chấp nhận ("Hình thức thanh toán" ra TM/CK đúng); 7.21 với mã giao dịch lạ trả `NOT_FOUND_DATA` và không thử lại (đúng). Chưa kiểm chứng: ZIP có chứa XML, và phát hành thật. |
| Thuế suất | **KCT – không chịu thuế GTGT** (mã `-1`) cho học phí của ICHI SKILL. |
| Mẫu số / ký hiệu | `1/001` / `C26TIS`, lấy từ các hóa đơn thật trên tài khoản. Bản xem trước 7.20 lại in ký hiệu **1C21TIS**, nên phải kiểm tra ký hiệu trên hóa đơn đầu tiên ở C3. |
| Giai đoạn thử | `VIETTEL_SINVOICE_AUTO_ISSUE=false` ở cấp hệ thống: chỉ xuất thủ công, kể cả khi cấu hình trường bật tự động. |
| Hóa đơn đầu tiên (C3) | Chỉ xuất cho phiếu thu **thật, đã xác minh nguồn gốc**. Phiếu thu duy nhất đang có trong DB production **không** dùng khi chưa xác minh. |

## Tóm tắt 3 giai đoạn

| Giai đoạn | Làm gì | Gọi Viettel? | Ảnh hưởng người dùng |
|---|---|---|---|
| **A** | Deploy code, chạy migration, tích hợp **TẮT** | Không | API khởi động lại vài giây; FE có thể lỗi trong lúc build (1–3 phút) |
| **B** | Thử với **Viettel môi trường test** trên stack staging riêng (DB riêng) | Viettel test | Không |
| **C** | Bật trên production, từng trường | Viettel thật | Hóa đơn bắt đầu được phát hành |

Không làm C khi B chưa PASS. **Không** trỏ production DB vào Viettel test: hóa đơn test sẽ gắn vào phiếu thu thật và chặn xuất hóa đơn thật cho các phiếu đó.

## Điều kiện trước khi bắt đầu

- [ ] Hai nhánh đã review. Khuyến nghị merge vào `master` qua PR, rồi deploy `master`. Runbook dùng biến `REF` nên deploy thẳng nhánh cũng được.
- [ ] Chọn giờ ít người dùng cho bước build FE (A7).
- [ ] Giai đoạn B: Viettel cấp tài khoản **môi trường test** (URL API, URL đăng nhập, username/password, MST, mẫu số, ký hiệu test).
- [ ] Giai đoạn C: tài khoản Viettel **production** của đúng đơn vị phát hành hóa đơn, có mẫu số và ký hiệu đã đăng ký. Không dùng lại tài khoản Viettel của ứng dụng khác (sales-management).
- [ ] Mật khẩu chỉ ghi vào `.env` (quyền `600`), không dán vào chat, ticket hay lịch sử shell.

---

## Giai đoạn A: deploy code, tích hợp tắt

Sau giai đoạn này: có bảng hóa đơn trong DB, có menu "Hóa đơn điện tử" trên FE (kèm banner "tích hợp đang tắt"), và **chưa có cuộc gọi nào tới Viettel** (`VIETTEL_SINVOICE_ENABLED` mặc định `false`).

### A0. Biến dùng chung

```bash
export REF=feat/einvoice-viettel        # hoặc master nếu đã merge
export TS=$(date +%Y%m%d-%H%M)
export BK=/root/backups/einvoice-$TS
mkdir -p "$BK" && chmod 700 "$BK"
```

### A1. Ghi nhận trạng thái hiện tại

```bash
cd /opt/school-fee-payment-be
git rev-parse --short HEAD     # mong đợi: af4a987
git status --short             # chỉ có ?? docker-compose.override.yml, ?? .env.uat-backup-*
docker compose ps              # api, db đều Up
```

**Dừng lại** nếu HEAD khác `af4a987` hoặc có file tracked bị sửa (` M ...`). Khi đó production đang chạy bản khác với runbook này.

### A2. Backup (DB, image, env, FE build)

```bash
cd /opt/school-fee-payment-be
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$BK/school_fee.dump"
docker run --rm -v "$BK":/d postgres:18-alpine pg_restore -l /d/school_fee.dump | grep -c "TABLE DATA"   # phải > 0
docker tag school-fee-payment-be-api:latest school-fee-payment-be-api:pre-einvoice
cp -p .env "$BK/opt.env"

cd /var/www/school-fee-payment-be
tar czf "$BK/fe-next.tgz" .next
git rev-parse --short master > "$BK/fe-master.txt"   # 5f2b851
ls -la "$BK"
```

### A3. Lấy code backend

```bash
cd /opt/school-fee-payment-be
git fetch origin
git checkout "$REF" && git pull --ff-only
git log --oneline -3          # phải có 57c4678 feat(einvoice): ...
git status --short            # vẫn chỉ có 2 file untracked như A1
```

`docker-compose.yml` mới có thêm service `redis` và volume `einvoice_files`. File `docker-compose.override.yml` (cổng 3030, DNS) giữ nguyên và vẫn được áp dụng.

### A4. Build image

```bash
docker compose build api
```

Cảnh báo "legacy builder is deprecated" là bình thường. Container đang chạy chưa bị ảnh hưởng.

### A5. Chạy migration (API cũ vẫn đang chạy)

Hai migration chỉ **tạo bảng/chỉ mục mới** (`einvoices`, `einvoice_configs`, `einvoice_attempts`, `einvoice_files`, `einvoice_events`), không sửa bảng cũ, nên API cũ không bị ảnh hưởng.

```bash
docker compose run --rm --no-deps api node ./node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
```

Mong đợi hai dòng:

```
Migration ViettelSinvoice1789200000000 has been executed successfully.
Migration EInvoiceUniqueActivePayment1789300000000 has been executed successfully.
```

Kiểm tra:

```bash
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select name from migrations order by timestamp desc limit 2"'
```

### A6. Khởi động Redis và API mới

```bash
docker compose up -d --wait redis api
docker compose ps
docker compose logs --since 3m api | grep -E "successfully started|ERROR|Error"
```

Smoke test backend:

```bash
curl -s -o /dev/null -w "%{http_code}\n" 127.0.0.1:3030/einvoices/provider-status   # 401 = route mới đã có (404 = vẫn image cũ)
docker compose exec -T redis redis-cli ping                                          # PONG
docker compose exec -T api ls -ld /app/storage/einvoices                             # thư mục tồn tại
```

Kiểm tra nhanh luồng cũ (VietQR, VietinBank, đăng nhập) theo thói quen vận hành hiện tại. Logic thanh toán không đổi khi tích hợp tắt.

### A7. Build và khởi động lại frontend

`next start` (pm2) phục vụ thẳng thư mục `.next` của chính thư mục này. Trong lúc `npm run build`, trang có thể lỗi vài phút, nên làm vào giờ ít người dùng.

```bash
cd /var/www/school-fee-payment-be
git status --short            # phải sạch
git fetch origin
git checkout "$REF" && git pull --ff-only
git log --oneline -2          # có cab8708 feat(einvoice): ...
git diff --stat "$(cat "$BK/fe-master.txt")" HEAD -- package.json package-lock.json   # rỗng → không cần npm ci
npm run build
pm2 restart school-fee-payment-fe
pm2 logs school-fee-payment-fe --lines 20 --nostream
curl -s -o /dev/null -w "%{http_code}\n" 127.0.0.1:3031/login    # 200
```

Lưu ý: không chạy `npm ci` khi lockfile không đổi, vì lệnh này xoá `node_modules` của tiến trình đang chạy.

### A8. Kiểm tra trên giao diện

Đăng nhập bằng tài khoản kế toán:

- Sidebar có mục **Hóa đơn điện tử**; trang hiện banner vàng "Tích hợp Viettel S-Invoice đang tắt trên máy chủ".
- Trang chi tiết phiếu thu có thẻ "Hóa đơn điện tử" với dòng "Chưa có hóa đơn. Tích hợp … đang tắt".
- **Hóa đơn điện tử → Cấu hình** mở được và chọn được trường.

Giai đoạn A xong. Có thể dừng ở đây bao lâu cũng được.

---

## Giai đoạn B: thử với Viettel môi trường test (staging riêng)

Stack staging dùng cùng code và image với production, nhưng là compose project riêng (`sfp-einvoice-staging`): DB riêng, Redis riêng, chỉ bind `127.0.0.1`. Quy trình này đã diễn tập với mock Viettel trên bản sao DB production và PASS.

### B1. Chuẩn bị cấu hình staging (ngoài repo)

```bash
install -d -m 700 /root/sfp-einvoice-staging
cd /root/sfp-einvoice-staging

cat > override.yml <<'EOF'
services:
  api:
    ports: !override
      - '127.0.0.1:3040:3010'
    dns: [1.1.1.1, 8.8.8.8]
  db:
    volumes: !override
      - db_data:/var/lib/postgresql
EOF

umask 077
cat > .env <<EOF
DB_USERNAME=postgres
DB_PASSWORD=$(openssl rand -hex 16)
DB_DATABASE=school_fee
DB_PORT=5440
JWT_SECRET=$(openssl rand -hex 24)
JWT_REFRESH_SECRET=$(openssl rand -hex 24)
PARENT_JWT_SECRET=$(openssl rand -hex 24)
VIETTEL_SINVOICE_ENABLED=true
VIETTEL_SINVOICE_AUTO_ISSUE=true
EOF
```

Mở `/root/sfp-einvoice-staging/.env` bằng trình soạn thảo (không `echo`) và thêm thông tin Viettel **test**:

```
VIETTEL_SINVOICE_BASE_URL=<URL API test Viettel cấp, kết thúc bằng />
VIETTEL_SINVOICE_AUTH_URL=<URL đăng nhập test Viettel cấp>
VIETTEL_SINVOICE_USERNAME=<username test>
VIETTEL_SINVOICE_PASSWORD=<password test>
```

### B2. Dựng stack staging

```bash
cd /opt/school-fee-payment-be
alias dcs='docker compose -p sfp-einvoice-staging -f docker-compose.yml -f /root/sfp-einvoice-staging/override.yml --env-file /root/sfp-einvoice-staging/.env'
dcs config --quiet && echo CONFIG_OK
dcs up -d --wait db
dcs run --rm --no-deps api node ./node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
dcs up -d --wait redis api
dcs exec -T api node dist/database/seeds/run-seed.js     # dữ liệu mẫu: trường KIMDONG, tài khoản admin@kimdong.edu.vn
curl -s -o /dev/null -w "%{http_code}\n" 127.0.0.1:3040/einvoices/provider-status   # 401
```

### B3. Chạy smoke test

Script `scripts/einvoice-smoke.mjs` lần lượt: cấu hình trường → tạo khoản thu → ghi nhận thanh toán → chờ hóa đơn → tải PDF/ZIP/XML → hủy hóa đơn (nếu có `--cancel`). Script chỉ chạy với API trên `127.0.0.1`/`localhost` và từ chối cổng production (3010/3030).

```bash
cd /opt/school-fee-payment-be
read -rsp "Mật khẩu admin seed: " SMOKE_PASSWORD; echo; export SMOKE_PASSWORD   # mật khẩu mặc định trong src/database/seeds/run-seed.ts
SMOKE_API=http://127.0.0.1:3040 \
SMOKE_EMAIL=admin@kimdong.edu.vn \
SMOKE_SCHOOL_CODE=KIMDONG \
SMOKE_TAX_CODE=<MST test> SMOKE_TEMPLATE=<mẫu số test> SMOKE_SERIES=<ký hiệu test> \
SMOKE_TAX_PERCENTAGE=-2 \
SMOKE_OUT=/root/sfp-einvoice-staging/out \
node scripts/einvoice-smoke.mjs --cancel
```

Mong đợi: `✓ Smoke test PASS`.

**Những điểm phải tự kiểm tra trên cổng Viettel test** (code chưa từng chạy với Viettel thật):

1. Hóa đơn hiện trên cổng Viettel với đúng người mua, số tiền, "Hình thức thanh toán" (CK/TM) và trạng thái thuế.
2. **Bước tải XML có thành công không.** Code giả định ZIP của Viettel (API 7.3) có chứa file `.xml`. Nếu báo "File ZIP của hóa đơn không chứa XML", cần sửa trước khi bật production.
3. Ý nghĩa mã thuế suất: `-2` = không kê khai, tính nộp thuế; `-1` = không chịu thuế. Đối chiếu tài liệu Viettel và chọn đúng loại cho học phí của đơn vị.
4. Hóa đơn bị hủy hiện trạng thái hủy trên cổng.
5. (Tuỳ chọn) Có email gửi tới phụ huynh nếu học sinh có email.

Nếu FAIL: script in lỗi Viettel trả về (errorCode/description) và lịch sử gọi. Xem thêm `dcs logs api`.

### B4. Dọn staging

```bash
cd /opt/school-fee-payment-be
dcs down -v
rm -rf /root/sfp-einvoice-staging
```

---

## Giai đoạn C: bật trên production

### C1. Khai báo tài khoản Viettel production

Dùng script có sẵn trên VPS (chỉ root đọc được, không nằm trong repo). Script đọc tài khoản từ `/root/sfp-einvoice-staging/viettel.env` và làm các việc sau:

- backup `.env`;
- thêm `ENABLED=true`, `AUTO_ISSUE=false`, username, password (trong nháy đơn vì mật khẩu có ký tự `$`);
- kiểm tra `docker compose` đọc đúng cả 4 giá trị;
- tạo lại container API;
- đăng nhập thử Viettel **từ trong container** (chỉ in HTTP status).

Mật khẩu không bị in ra ở bước nào. Script dừng ngay nếu `.env` đã có biến `VIETTEL_SINVOICE_*`.

```bash
bash /root/sfp-einvoice-staging/c1-enable-viettel.sh
```

Mong đợi, theo thứ tự:

- `• docker compose đọc đúng ENABLED, AUTO_ISSUE, USERNAME, PASSWORD`
- `Nest application successfully started`
- `• Biến trong container: ENABLED=true AUTO_ISSUE=false`
- `• Đăng nhập Viettel từ container: HTTP 200, token có`
- `✓ C1 xong`

Làm tay (nếu không dùng script): thêm 4 dòng sau vào `/opt/school-fee-payment-be/.env`, rồi `docker compose up -d --wait api`.

```
VIETTEL_SINVOICE_ENABLED=true
VIETTEL_SINVOICE_AUTO_ISSUE=false
VIETTEL_SINVOICE_USERNAME='<username>'
VIETTEL_SINVOICE_PASSWORD='<password>'
```

- `docker compose config` hiển thị mỗi ký tự `$` thành `$$`. Đó chỉ là cách in ra; container vẫn nhận đúng giá trị.
- `BASE_URL`/`AUTH_URL` mặc định là production Viettel (`api-vinvoice.viettel.vn`).
- MST, mẫu số, ký hiệu, thuế suất **không** lấy từ `.env` mà từ cấu hình từng trường (bước C2). Các biến `VIETTEL_SINVOICE_TAX_CODE/TEMPLATE_CODE/SERIES` không được code dùng.

Trên FE, banner "tích hợp đang tắt" phải biến mất.

Rollback C1: chép lại `/root/backups/einvoice-20261009-1425/opt.env.before-c1` thành `/opt/school-fee-payment-be/.env` rồi `docker compose up -d --wait api`.

### C2. Cấu hình một trường, tạm tắt tự động xuất

Vào **Hóa đơn điện tử → Cấu hình**, chọn trường:

- Bật hóa đơn điện tử: **bật**
- Tự động xuất khi thanh toán được khớp: **tắt** (cho lần đầu)
- MST bên bán: `0316660845`
- Mẫu số: `1/001`
- Ký hiệu: `C26TIS`
- Thuế suất GTGT: **Không chịu thuế (KCT)**. Ô "Học phí đã gồm thuế?" để trống vì không áp dụng.

### C3. Xuất thử một hóa đơn thật

1. Chọn một phiếu thu **thật, đã đối chiếu với giao dịch ngân hàng hoặc tiền mặt thực nhận**, số tiền nhỏ, thông tin phụ huynh đầy đủ. Nếu học sinh có email phụ huynh, hệ thống sẽ tự gửi hóa đơn sau khi phát hành.
2. Mở phiếu thu → **Xuất hóa đơn** → xác nhận.
3. Chờ trạng thái **Đã phát hành** (thường dưới 1 phút).
4. **Xem hóa đơn** để kiểm tra PDF, rồi Tải XML / Tải ZIP.
5. Đối chiếu trên cổng `vinvoice.viettel.vn`. Kiểm tra kỹ: **ký hiệu C26TIS** (không phải 1C21TIS), thuế suất hiển thị **KCT**, hình thức thanh toán, tên người mua.

Nếu sai thông tin: **Hủy hóa đơn** (ghi lý do) hoặc lập hóa đơn thay thế trên cổng Viettel, theo quy định. Sửa cấu hình rồi làm lại.

### C4. Bật tự động xuất

Khi C3 đạt yêu cầu:

1. Bật tự động ở **cấp hệ thống**: trong `/opt/school-fee-payment-be/.env` đổi `VIETTEL_SINVOICE_AUTO_ISSUE=false` thành `true`, rồi `docker compose up -d --wait api`.
2. Bật "Tự động xuất khi thanh toán được khớp" cho trường.
3. Lặp lại C2–C4 cho các trường khác.

Cần cả hai công tắc (hệ thống và trường) thì mới tự xuất.

Phiếu thu phát sinh **trước** khi bật không tự có hóa đơn. Mỗi phiếu phải bấm "Xuất hóa đơn" riêng (chưa có chức năng xuất hàng loạt). Cần quyết định chính sách cho các phiếu này.

### C5. Theo dõi

```bash
cd /opt/school-fee-payment-be
q() { docker compose exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"$1\""; }
q "select status, count(*) from einvoices group by 1 order by 1"
q "select id, status, error_code, left(error_description, 80) as error, updated_at from einvoices where status in ('FAILED','QUEUED','PROCESSING','WAITING_INVOICE_NUMBER','FILE_PENDING') order by updated_at"
q "select operation, status, error_code, count(*) from einvoice_attempts where created_at > now() - interval '1 day' group by 1,2,3 order by 4 desc"
```

- `FAILED` + lỗi nghiệp vụ Viettel: sửa nguyên nhân (cấu hình, thông tin học sinh) rồi bấm **Phát hành lại** trên UI.
- `WAITING_INVOICE_NUMBER` kéo dài: bấm **Đồng bộ với Viettel**.
- Thiếu PDF/ZIP: mở "Xem hóa đơn" → **Tải lại từ Viettel**.

Volume `einvoice_files` chứa PDF/ZIP đã tải. Các file này tải lại được từ Viettel, nhưng nên đưa volume vào lịch backup.

---

## Rollback

### Trước khi có hóa đơn thật (giai đoạn A hoặc B)

Backend, theo thứ tự:

1. (Tuỳ chọn) Xoá bảng mới. Phải làm **trước** bước 2, vì chỉ image mới có file migration. Chạy 2 lần:

   ```bash
   cd /opt/school-fee-payment-be
   docker compose run --rm --no-deps api node ./node_modules/typeorm/cli.js migration:revert -d dist/database/data-source.js
   ```

   Bỏ qua bước này thì bảng mới vẫn nằm trong DB, code cũ không dùng tới nên vô hại.

2. Trả code và image cũ, gỡ Redis:

   ```bash
   cd /opt/school-fee-payment-be
   git checkout af4a987
   docker tag school-fee-payment-be-api:pre-einvoice school-fee-payment-be-api:latest
   docker compose up -d --no-build --remove-orphans api    # --remove-orphans gỡ container redis
   curl -s -o /dev/null -w "%{http_code}\n" 127.0.0.1:3030/einvoices/provider-status   # 404 = đã về bản cũ
   ```

Frontend:

```bash
cd /var/www/school-fee-payment-be
git checkout master
rm -rf .next && tar xzf "$BK/fe-next.tgz"
pm2 restart school-fee-payment-fe
```

### Sau khi đã phát hành hóa đơn thật

**Không** revert migration và **không** xoá volume `einvoice_files`: đây là chứng từ thuế. Để dừng phát hành:

```bash
# sửa /opt/school-fee-payment-be/.env: VIETTEL_SINVOICE_ENABLED=false
cd /opt/school-fee-payment-be && docker compose up -d --wait api
```

Hóa đơn đã phát hành vẫn có hiệu lực trên Viettel. Xử lý sai sót (hủy, thay thế) qua UI hoặc cổng Viettel. Chỉ quay về image cũ khi lỗi không liên quan tới hóa đơn.

### Khôi phục DB từ backup (chỉ khi dữ liệu hỏng)

```bash
cd /opt/school-fee-payment-be
docker compose stop api
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$BK/school_fee.dump"
docker compose start api
```

---

## Phụ lục: những gì đã được kiểm chứng

- Unit test backend 121/121; e2e hóa đơn (mock Viettel) 18/18.
- Đã bấm thử trên trình duyệt với mock Viettel: danh sách, xem hóa đơn, tải PDF/XML/ZIP, xuất thủ công, hủy, cấu hình.
- **Diễn tập giai đoạn A trên bản sao DB production** (lệnh pg_dump ở A2 → nạp vào DB tạm): image build bằng cùng Dockerfile; lệnh migration ở A5 chạy đúng trên dữ liệu thật và giữ nguyên dữ liệu cũ; `up -d --wait` và các lệnh smoke ở A6 (401, PONG, thư mục lưu file) đạt.
- **Diễn tập giai đoạn B** (seed + `scripts/einvoice-smoke.mjs --cancel`) với mock Viettel: PASS. Sau đó script chỉ thêm phần chặn URL không phải localhost và in lỗi gọn; hai phần này đã được thử riêng.
- `npm run build` của commit FE `cab8708` thành công (build trong bản sao, không đụng `.next` đang chạy).
- `migration:revert` hai lần (phần rollback) đưa DB về đúng `AddVietinbankProvider1789100000000`; các truy vấn theo dõi ở C5 chạy đúng (thử trên Postgres tạm).

- Script C1 chạy thử (`DRY_RUN=1`) trên file `.env` giả với mật khẩu giả có nhiều ký tự `$`: compose đọc đúng, container nhận đúng nguyên văn; chạy lần hai thì script tự dừng, không ghi trùng.
- Viettel production, không phát hành (09/10): đăng nhập, xem trước 7.20, tra 7.21 với mã lạ.

Chưa kiểm chứng (kiểm ở C3): phát hành thật (7.2), đối soát số (7.21), tải file (7.3, gồm việc ZIP có XML hay không), gửi email (7.33), hủy (7.9).
