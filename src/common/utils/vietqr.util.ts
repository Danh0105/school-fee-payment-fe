/**
 * Minimal EMVCo/VietQR (NAPAS) payload builder — dynamic, one-time QR for a
 * single transfer amount with a unique reference in the "additional data"
 * field. Sufficient for generating a scannable transfer QR; a certified
 * NAPAS SDK should replace this for production compliance (exact bank BIN
 * table, merchant category codes, etc).
 */

function tlv(id: string, value: string): string {
  const byteLength = Buffer.byteLength(value, 'utf8');
  if (byteLength > 99) {
    throw new Error(`VietQR field ${id} exceeds 99 bytes`);
  }
  const length = byteLength.toString().padStart(2, '0');
  return `${id}${length}${value}`;
}

function crc16Ccitt(input: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(input, 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc & 0x8000) !== 0
          ? ((crc << 1) ^ 0x1021) & 0xffff
          : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function truncateVietQrText(value: string, maxBytes: number): string {
  let result = '';
  let byteLength = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (byteLength + characterBytes > maxBytes) break;
    result += character;
    byteLength += characterBytes;
  }
  return result;
}

export interface VietQrPayloadInput {
  bankBin: string;
  accountNumber: string;
  amount: string;
  addInfo: string;
  merchantName?: string;
  merchantCity?: string;
  /** '11' static (reusable, no expiry) or '12' dynamic (default). */
  pointOfInitiation?: '11' | '12';
}

export function buildVietQrPayload(input: VietQrPayloadInput): string {
  const beneficiaryInfo =
    tlv('00', input.bankBin) + tlv('01', input.accountNumber);
  const consumerAccount = tlv('00', beneficiaryInfo) + tlv('01', 'QRIBFTTA');
  const merchantAccountInfo =
    tlv('00', 'A000000727') + tlv('01', consumerAccount);

  // Field 62 contains the nested 08 TLV, so its value must leave four bytes
  // for the nested tag and length while staying within EMVCo's 99-byte cap.
  const additionalData = tlv('08', truncateVietQrText(input.addInfo, 95));

  const payloadWithoutCrc =
    tlv('00', '01') +
    tlv('01', input.pointOfInitiation ?? '12') +
    tlv('38', merchantAccountInfo) +
    tlv('53', '704') +
    tlv('54', input.amount) +
    tlv('58', 'VN') +
    tlv('59', truncateVietQrText(input.merchantName ?? 'SCHOOL', 25)) +
    tlv('60', truncateVietQrText(input.merchantCity ?? 'VIETNAM', 15)) +
    tlv('62', additionalData) +
    '6304';

  return payloadWithoutCrc + crc16Ccitt(payloadWithoutCrc);
}

export function buildVietQrImageUrl(input: VietQrPayloadInput): string {
  const params = new URLSearchParams({
    amount: input.amount,
    addInfo: input.addInfo,
    accountName: input.merchantName ?? '',
  });
  return `https://img.vietqr.io/image/${input.bankBin}-${input.accountNumber}-compact2.png?${params.toString()}`;
}

/**
 * Transfer content as banks carry it reliably: no diacritics, single spaces
 * ("HV0723 THVTS Lớp 3A4 Lê Chấn Hưng" → "HV0723 THVTS Lop 3A4 Le Chan Hung").
 */
export function toVietQrText(value: string): string {
  return value
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface TransferQrInput {
  bankBin: string;
  accountNumber: string;
  accountName: string;
  amount: string;
  transferContent: string;
  /** No expiry: a static QR the payer may scan again. */
  reusable: boolean;
}

/** The QR printed on payment slips and stored on their payment orders. */
export function buildTransferQr(input: TransferQrInput): {
  transferContent: string;
  qrPayload: string;
  qrUrl: string;
} {
  const transferContent = truncateVietQrText(
    toVietQrText(input.transferContent),
    95,
  );
  const payloadInput: VietQrPayloadInput = {
    bankBin: input.bankBin,
    accountNumber: input.accountNumber,
    amount: input.amount,
    addInfo: transferContent,
    merchantName: toVietQrText(input.accountName),
    pointOfInitiation: input.reusable ? '11' : '12',
  };
  return {
    transferContent,
    qrPayload: buildVietQrPayload(payloadInput),
    qrUrl: buildVietQrImageUrl(payloadInput),
  };
}
