# Prompt: Deploy Backend lên VPS

Copy toàn bộ nội dung dưới đây làm prompt cho phiên làm việc deploy backend
NestJS này (`F:\school-fee-payment-be`) lên một VPS (Ubuntu 22.04+ khuyến
nghị). Repo đã có sẵn `Dockerfile` + `docker-compose.yml` (đã cập nhật đầy
đủ biến môi trường trong phiên này) — dùng đúng 2 file đó, **không viết lại
từ đầu** trừ khi có lý do rõ ràng.

---

## 1. Yêu cầu hạ tầng tối thiểu

- VPS Ubuntu 22.04+ (hoặc Debian 12+), tối thiểu 1 vCPU / 2GB RAM (Postgres
  + Node cùng chạy trên 1 máy nhỏ vẫn ổn cho quy mô vài trường học).
- Docker Engine + Docker Compose plugin (`docker compose version` phải chạy
  được — không dùng `docker-compose` v1 đã cũ).
- Một domain/subdomain trỏ về IP VPS (vd `api.truonghoc.vn`) — bắt buộc để
  có HTTPS thật, vì Mini App Zalo và webhook ngân hàng đều yêu cầu HTTPS.
- Firewall (`ufw`) chỉ mở đúng 3 cổng: `22` (SSH), `80`, `443`. **Không mở
  cổng `3010` hay `5432` ra ngoài** — xem mục 4.

## 2. Chuẩn bị server

```bash
# Cài Docker (script chính thức)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # rồi logout/login lại

# Firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Clone code
git clone <repo-url> /opt/school-fee-payment-be
cd /opt/school-fee-payment-be
```

## 3. Cấu hình biến môi trường production

```bash
cp .env.example .env
```

Sửa `.env` — đây là danh sách **đầy đủ** biến hiện tại (đối chiếu lại với
`.env.example` thật trong repo nếu có sai khác, đó là nguồn đúng nhất):

| Biến | Giá trị production |
| --- | --- |
| `NODE_ENV` | `production` |
| `DB_HOST` | `db` (tên service trong docker-compose, không phải `localhost`) |
| `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` | Đặt mật khẩu Postgres mạnh, không dùng `postgres/postgres` mặc định |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Sinh ngẫu nhiên dài (`openssl rand -hex 32`), **khác nhau**, không dùng giá trị mẫu `change-me...` |
| `PARENT_JWT_SECRET` | Sinh ngẫu nhiên riêng, **khác** `JWT_SECRET` (bắt buộc — token phụ huynh và token nhân viên phải không thể dùng lẫn nhau) |
| `BANK_CODE`, `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_NAME` | Tài khoản ngân hàng thật nếu dùng VietQR mặc định (từng trường có thể override riêng qua `schools.bank*`) |
| `PAYMENT_WEBHOOK_SECRET` | Bắt buộc đặt giá trị thật nếu có webhook xác nhận thanh toán tự động — không để trống ở production |
| `CORS_ORIGINS` | **Toàn bộ domain FE thật** đang gọi API này, cách nhau bởi dấu phẩy — vd `https://admin.truonghoc.vn,https://mini-app-domain` (Mini App Zalo chạy trong webview của Zalo, kiểm tra origin thật mà Zalo dùng khi publish, không phải `localhost:2999` như lúc dev) |
| `ZALO_OA_ID`, `ZALO_APP_ID`, `ZALO_APP_SECRET`, `ZALO_ZNS_TEMPLATE_ID`, `ZALO_INITIAL_REFRESH_TOKEN` | Xem mục "Cấu hình Zalo ZNS" trong `README.md` — chỉ cần nếu dùng tính năng gửi QR qua Zalo |

**Không commit `.env` thật lên git.** File này đã nằm trong `.gitignore`
theo chuẩn NestJS — kiểm tra lại nếu không chắc.

## 4. Build và chạy bằng Docker Compose

```bash
docker compose up -d --build
```

`docker-compose.yml` đã được cấu hình (trong phiên làm việc này) để:

- `db` (Postgres) chỉ bind `127.0.0.1:5432` trên host — **không lộ ra
  internet**, `api` vẫn kết nối được qua mạng nội bộ Docker (`DB_HOST=db`).
- `api` chỉ bind `127.0.0.1:3010` trên host — public traffic phải đi qua
  reverse proxy ở mục 5, không gọi thẳng cổng 3010 từ ngoài.
- Cả 2 service đều `restart: unless-stopped` — tự khởi động lại khi VPS
  reboot hoặc container crash.

## 5. Chạy migration

**Bắt buộc chạy sau lần `up` đầu tiên và sau mỗi lần deploy có migration
mới** — schema không tự đồng bộ (`synchronize: false` cố định trong code).

```bash
docker compose exec api npm run migration:run:prod
```

Dùng đúng script `migration:run:prod` (mới thêm trong phiên này) — **không
dùng** `npm run migration:run` thường trong container production, vì lệnh
đó cần `ts-node` (devDependency, không có trong image production do
`npm ci --omit=dev`). `migration:run:prod` chạy thẳng trên code đã build
sẵn (`dist/database/data-source.js`), không cần `ts-node`.

Kiểm tra log không có lỗi, sau đó xác nhận API sống:

```bash
curl http://127.0.0.1:3010/health
```

## 6. Reverse proxy + HTTPS (Caddy — khuyến nghị vì tự động cấp SSL)

Cài Caddy (hoặc dùng Nginx + certbot nếu team đã quen Nginx):

```bash
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
api.truonghoc.vn {
    reverse_proxy 127.0.0.1:3010
}
```

```bash
sudo systemctl reload caddy
```

Caddy tự lấy chứng chỉ Let's Encrypt và redirect HTTP→HTTPS. Nếu dùng
Nginx thay vào đó, nhớ set `proxy_set_header X-Forwarded-For $remote_addr;`
và `proxy_set_header X-Forwarded-Proto $scheme;` để backend nhận đúng IP
thật của client (audit log dùng `ipAddress` từ request — nếu cần chính
xác IP người dùng thật đằng sau proxy, cân nhắc thêm
`app.set('trust proxy', 1)` vào `main.ts`, hiện chưa bật).

## 7. Swagger ở production

`/api/docs` hiện **không có xác thực**, expose toàn bộ shape API ra công
khai. Với 1 backend nội bộ phục vụ vài trường học, thường chấp nhận được,
nhưng nếu muốn chặn:

- Đặt Caddy/Nginx chặn path `/api/docs*` bằng basic auth hoặc IP allowlist,
  hoặc
- Yêu cầu backend sửa `main.ts` để chỉ mount Swagger khi
  `NODE_ENV !== 'production'`.

Không tự ý sửa code phần này nếu chưa được yêu cầu — hỏi lại nếu team muốn
ẩn Swagger.

## 8. Backup Postgres

Dữ liệu nằm trong Docker volume `db_data`. Thêm cron backup hàng ngày:

```bash
# /etc/cron.daily/pg-backup (chmod +x)
#!/bin/sh
docker compose -f /opt/school-fee-payment-be/docker-compose.yml exec -T db \
  pg_dump -U postgres school_fee | gzip > /var/backups/school_fee-$(date +%F).sql.gz
find /var/backups -name 'school_fee-*.sql.gz' -mtime +14 -delete
```

Đẩy backup này ra ngoài VPS định kỳ (S3, Backblaze, hoặc rsync sang máy
khác) — backup nằm cùng ổ đĩa với server không bảo vệ được trước sự cố mất
toàn bộ máy.

## 9. Quy trình deploy khi có code mới

```bash
cd /opt/school-fee-payment-be
git pull
docker compose up -d --build api
docker compose exec api npm run migration:run:prod
curl http://127.0.0.1:3010/health
```

Không cần rebuild `db` (chỉ đổi khi đổi version Postgres trong
docker-compose.yml). Nếu migration thất bại, **không** tiếp tục chạy phiên
bản code mới trên schema cũ — dừng lại, xem log, xử lý migration trước.

## 10. Checklist trước khi go-live

- [ ] `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PARENT_JWT_SECRET` là 3 giá trị
      ngẫu nhiên khác nhau, không phải giá trị mẫu trong `.env.example`.
- [ ] `DB_PASSWORD` không phải `postgres`.
- [ ] Cổng `5432` và `3010` không mở ra internet (`ufw status`, và kiểm
      tra `docker compose ps` thấy port map là `127.0.0.1:...`).
- [ ] `CORS_ORIGINS` chỉ liệt kê đúng domain FE thật đang dùng, không còn
      `localhost`.
- [ ] HTTPS hoạt động (`curl -I https://api.truonghoc.vn/health` trả 200,
      không có cảnh báo chứng chỉ).
- [ ] Đã chạy `migration:run:prod` và xác nhận không còn migration nào
      pending (`docker compose exec api npm run migration:run:prod` chạy
      lại lần 2 phải báo "No migrations are pending").
- [ ] Cron backup Postgres đã chạy thử ít nhất 1 lần thành công.
- [ ] Test thử 1 luồng đầy đủ qua domain thật: tạo trường → tạo kế hoạch
      thu → gán → tạo yêu cầu thanh toán → xem QR — không chỉ test qua
      `localhost`.

Nếu VPS dùng nhà cung cấp có sẵn firewall ở console (AWS Security Group,
DigitalOcean Cloud Firewall...), cấu hình luôn ở đó thay vì chỉ dựa vào
`ufw` trên máy — an toàn hơn khi có 2 lớp chặn.
