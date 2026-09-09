/**
 * Normalizes a Vietnamese phone number to Zalo ZNS's required format:
 * country code 84, no leading 0, no separators (e.g. "0901234567" -> "84901234567").
 * Returns null if the input doesn't look like a Vietnamese mobile number.
 */
export function toZaloPhoneFormat(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.startsWith('84') && digits.length === 11) return digits;
  if (digits.startsWith('0') && digits.length === 10)
    return `84${digits.slice(1)}`;
  if (digits.length === 9) return `84${digits}`;
  return null;
}
