export function maskIdentifierCode(
  value: string | null | undefined,
): string | null {
  if (!value) return value ?? null;
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
}
