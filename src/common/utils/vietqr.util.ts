/**
 * Minimal EMVCo/VietQR (NAPAS) payload builder — dynamic, one-time QR for a
 * single transfer amount with a unique reference in the "additional data"
 * field. Sufficient for generating a scannable transfer QR; a certified
 * NAPAS SDK should replace this for production compliance (exact bank BIN
 * table, merchant category codes, etc).
 */

function tlv(id: string, value: string): string {
  const length = value.length.toString().padStart(2, '0');
  return `${id}${length}${value}`;
}

function crc16Ccitt(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc & 0x8000) !== 0
          ? ((crc << 1) ^ 0x1021) & 0xffff
          : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface VietQrPayloadInput {
  bankBin: string;
  accountNumber: string;
  amount: string;
  addInfo: string;
  merchantName?: string;
  merchantCity?: string;
}

export function buildVietQrPayload(input: VietQrPayloadInput): string {
  const beneficiaryInfo =
    tlv('00', input.bankBin) + tlv('01', input.accountNumber);
  const consumerAccount = tlv('00', beneficiaryInfo) + tlv('01', 'QRIBFTTA');
  const merchantAccountInfo =
    tlv('00', 'A000000727') + tlv('01', consumerAccount);

  const additionalData = tlv('08', input.addInfo.slice(0, 99));

  const payloadWithoutCrc =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('38', merchantAccountInfo) +
    tlv('53', '704') +
    tlv('54', input.amount) +
    tlv('58', 'VN') +
    tlv('59', (input.merchantName ?? 'SCHOOL').slice(0, 25)) +
    tlv('60', (input.merchantCity ?? 'VIETNAM').slice(0, 15)) +
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
