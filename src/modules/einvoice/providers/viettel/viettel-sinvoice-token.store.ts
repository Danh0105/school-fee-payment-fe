import { Injectable } from '@nestjs/common';

@Injectable()
export class ViettelSinvoiceTokenStore {
  private token: string | null = null;
  private expiresAt: number | null = null;

  get(): string | null {
    if (this.expiresAt != null && Date.now() >= this.expiresAt) this.clear();
    return this.token;
  }

  /** `expiresAt` is null when Viettel gave no lifetime: keep the token. */
  set(token: string, expiresAt: number | null = null): void {
    this.token = token;
    this.expiresAt = expiresAt;
  }

  clear(): void {
    this.token = null;
    this.expiresAt = null;
  }
}
