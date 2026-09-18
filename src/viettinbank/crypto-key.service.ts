import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Loads the RSA keypair used to sign VietinBank responses and the bank's
 * public certificate used to verify inbound (inq-bill/notify-bill)
 * signatures. Keys are read lazily on first use (not in the constructor) so
 * a deployment without VietinBank configured never fails to boot.
 */
@Injectable()
export class CryptoKeyService implements OnModuleInit {
  private privateKey: string | null = null;
  private publicKey: string | null = null;
  private notifyCert: string | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    // Fail fast at boot if VietinBank is configured but a key is missing,
    // instead of only surfacing the error on the first bank callback.
    const privateKeyPath = this.config.get<string>(
      'viettinbank.privateKeyPath',
    );
    if (privateKeyPath) this.loadKeys();
  }

  private loadKeys() {
    if (this.privateKey && this.publicKey && this.notifyCert) return;

    const privateKeyPath = this.requireConfig('viettinbank.privateKeyPath');
    const publicKeyPath = this.requireConfig('viettinbank.publicKeyPath');
    const notifyCertPath = this.requireConfig('viettinbank.notifyCertPath');

    this.privateKey = this.readKeyFile(privateKeyPath);
    this.publicKey = this.readKeyFile(publicKeyPath);
    this.notifyCert = this.readKeyFile(notifyCertPath);
  }

  private requireConfig(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) throw new Error(`${key} is not configured`);
    return value;
  }

  private readKeyFile(configuredPath: string): string {
    const resolved = path.resolve(configuredPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`VietinBank key file not found: ${resolved}`);
    }
    return fs.readFileSync(resolved, 'utf8');
  }

  /** Verifies a signature from VietinBank against the bank's notify cert. */
  verify(data: string, signature: string): boolean {
    this.loadKeys();
    try {
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(Buffer.from(data, 'utf8'));
      verifier.end();
      const cleanSignature = signature.replace(/[\r\n]/g, '');
      return verifier.verify(
        { key: this.notifyCert!, padding: crypto.constants.RSA_PKCS1_PADDING },
        Buffer.from(cleanSignature, 'base64'),
      );
    } catch {
      return false;
    }
  }

  /** Signs data with our private key to return in a response to VietinBank. */
  sign(data: string): string {
    this.loadKeys();
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(data, 'utf8');
    signer.end();
    return signer.sign(this.privateKey!, 'base64');
  }
}
