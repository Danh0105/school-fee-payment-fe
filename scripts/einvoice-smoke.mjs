#!/usr/bin/env node
// Staging smoke test for the Viettel S-Invoice integration.
//
// Drives one invoice through the public API the way the app does it:
// configure the school → unpaid receivable → payment order → manual
// payment → wait for the invoice → download PDF/ZIP/XML → (optionally)
// cancel it at Viettel.
//
// It CREATES a payment and an e-invoice. Run it only against a staging
// stack wired to Viettel's TEST environment, never against production.
//
//   SMOKE_API=http://127.0.0.1:3040 \
//   SMOKE_EMAIL=admin@kimdong.edu.vn SMOKE_PASSWORD=... \
//   SMOKE_TAX_CODE=0316660845 SMOKE_TEMPLATE=1/001 SMOKE_SERIES=C26TAA \
//   node scripts/einvoice-smoke.mjs [--cancel]
//
// Optional: SMOKE_SCHOOL_CODE (default: first school), SMOKE_TAX_PERCENTAGE
// (default -2), SMOKE_PRICES_INCLUDE_TAX (true|false, required when > 0),
// SMOKE_OUT (where the downloaded files go, default ./einvoice-smoke-out).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

process.on('uncaughtException', (error) => {
  const reason = error.cause?.code ? ` (${error.cause.code})` : '';
  console.error(`✗ ${error.message}${reason}`);
  process.exit(1);
});

const env = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    console.error(`Thiếu biến môi trường ${name}`);
    process.exit(2);
  }
  return value;
};

const API = env('SMOKE_API').replace(/\/+$/, '');
const OUT = resolve(env('SMOKE_OUT', './einvoice-smoke-out'));
const CANCEL = process.argv.includes('--cancel');
const TIMEOUT_MS = 5 * 60_000;

// Staging runs on this VPS behind 127.0.0.1; production listens on
// 3010/3030 locally and on the public domain.
const target = new URL(API);
if (
  !['127.0.0.1', 'localhost'].includes(target.hostname) ||
  ['3010', '3030'].includes(target.port)
) {
  console.error(
    `${API} không phải API staging cục bộ; script này không được chạy vào production.`,
  );
  process.exit(2);
}

let token;
async function call(method, path, body, { raw = false } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `${method} ${path} → ${res.status} ${json?.error?.message ?? ''}`,
    );
  }
  return json?.data;
}

const step = (message) => console.log(`• ${message}`);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

step(`Đăng nhập ${API}`);
({ accessToken: token } = await call('POST', '/auth/login', {
  email: env('SMOKE_EMAIL'),
  password: env('SMOKE_PASSWORD'),
}));

const status = await call('GET', '/einvoices/provider-status');
if (!status.enabled) {
  throw new Error('VIETTEL_SINVOICE_ENABLED=false trên server staging');
}

const schools = (await call('GET', '/schools?limit=200')).data;
const school = process.env.SMOKE_SCHOOL_CODE
  ? schools.find((s) => s.code === process.env.SMOKE_SCHOOL_CODE)
  : schools[0];
if (!school) throw new Error('Không tìm thấy trường');
step(`Trường: ${school.name}`);

const taxPercentage = env('SMOKE_TAX_PERCENTAGE', '-2');
const config = {
  enabled: true,
  autoIssue: true,
  supplierTaxCode: env('SMOKE_TAX_CODE'),
  templateCode: env('SMOKE_TEMPLATE'),
  invoiceSeries: env('SMOKE_SERIES'),
  taxPercentage,
  signingMode: 'HSM',
};
if (process.env.SMOKE_PRICES_INCLUDE_TAX)
  config.pricesIncludeTax = process.env.SMOKE_PRICES_INCLUDE_TAX === 'true';
await call('PUT', `/einvoices/config/${school.id}`, config);
step(
  `Cấu hình HĐĐT: MST ${config.supplierTaxCode}, mẫu ${config.templateCode}, ký hiệu ${config.invoiceSeries}, thuế ${taxPercentage}`,
);

const unpaid = async () =>
  (
    await call('GET', `/receivables?schoolId=${school.id}&limit=200`)
  ).data.filter((r) => r.status === 'UNPAID');
let receivables = await unpaid();
if (!receivables.length) {
  const plan = (
    await call('GET', `/fee-plans?schoolId=${school.id}&limit=200`)
  ).data.find((p) => p.status === 'ACTIVE');
  const students = (
    await call('GET', `/students?schoolId=${school.id}&limit=200`)
  ).data;
  if (!plan || !students.length)
    throw new Error('Trường không có kế hoạch thu ACTIVE hoặc học sinh');
  await call('POST', `/fee-plans/${plan.id}/assign`, {
    targetType: 'STUDENT',
    studentIds: students.map((s) => s.id),
  });
  receivables = await unpaid();
}
const receivable = receivables[0];
if (!receivable) throw new Error('Không còn khoản công nợ chưa thu');

const order = await call('POST', '/payment-orders', {
  studentId: receivable.studentId,
  items: [{ receivableId: receivable.id }],
});
const amount = String(Math.round(Number(order.requestedAmount)));
step(`Yêu cầu thanh toán ${order.orderCode}: ${amount} đ`);

const payment = await call('POST', '/payment-transactions/manual', {
  externalTransactionId: `SMOKE-${Date.now()}`,
  amount,
  transferContent: order.transferContent,
});
if (!payment.matched) throw new Error('Thanh toán không khớp yêu cầu thu');
step('Đã ghi nhận thanh toán, chờ hóa đơn…');

const started = Date.now();
let invoice;
for (;;) {
  invoice = (
    await call(
      'GET',
      `/einvoices?studentId=${receivable.studentId}&limit=1&sortBy=createdAt&sortOrder=DESC`,
    )
  ).data[0];
  if (invoice && ['COMPLETED', 'FAILED'].includes(invoice.status)) break;
  if (Date.now() - started > TIMEOUT_MS)
    throw new Error(
      `Quá ${TIMEOUT_MS / 60_000} phút, trạng thái: ${invoice?.status ?? 'chưa tạo'}`,
    );
  await sleep(3_000);
}
const detail = await call('GET', `/einvoices/${invoice.id}`);
if (invoice.status === 'FAILED') {
  console.error(
    '✗ Phát hành lỗi:',
    invoice.errorCode,
    invoice.errorDescription,
  );
  for (const a of detail.attempts)
    console.error(
      `  ${a.operation} ${a.status} ${a.errorCode ?? ''} ${a.errorDescription ?? ''}`,
    );
  process.exit(1);
}
step(
  `Hóa đơn ${invoice.invoiceNo} (mã tra cứu ${invoice.reservationCode ?? '—'}) → ${invoice.status}`,
);

mkdirSync(OUT, { recursive: true, mode: 0o700 });
let ok = true;
for (const type of ['pdf', 'zip', 'xml']) {
  const res = await call('GET', `/einvoices/${invoice.id}/${type}`, null, {
    raw: true,
  });
  if (!res.ok) {
    ok = false;
    const body = await res.json().catch(() => null);
    console.error(`✗ Tải ${type}: ${res.status} ${body?.error?.message ?? ''}`);
    continue;
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  const file = join(OUT, `${invoice.invoiceNo}.${type}`);
  writeFileSync(file, bytes, { mode: 0o600 });
  step(`Tải ${type.toUpperCase()}: ${bytes.length} byte → ${file}`);
}

if (CANCEL) {
  await call('POST', `/einvoices/${invoice.id}/cancel`, {
    reason: 'Kiểm thử tích hợp trên môi trường staging',
  });
  const cancelled = await call('GET', `/einvoices/${invoice.id}`);
  step(`Hủy hóa đơn → ${cancelled.status}`);
  ok &&= cancelled.status === 'CANCELLED';
}

console.log(ok ? '✓ Smoke test PASS' : '✗ Smoke test FAIL');
process.exit(ok ? 0 : 1);
