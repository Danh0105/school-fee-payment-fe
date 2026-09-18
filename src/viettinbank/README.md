# VietinBank module

Self-contained VietinBank eBank Biz collection integration, packaged so it can be copied into any other NestJS backend.

## Layout

- `crypto-key.service.ts`, `viettinbank-api.service.ts`, `viettinbank.module.ts` — **portable, no domain dependency.** Copy this folder as-is into another project's `src/viettinbank/`.
- `viettinbank.controller.ts`, `viettinbank-gateway.module.ts` — bank-facing `inq-bill` / `notify-bill` endpoints. These call into *this* project's `PaymentOrdersService` / `PaymentTransactionsService`; on another project, re-implement just the order lookup + ingest calls inside the controller to match that project's own order/transaction model.
- `../payment-providers/providers/viettinbank.provider.ts` — adapter implementing this project's generic `PaymentProvider` interface (`createQr` / `verifyWebhook` / `parseTransaction`). Only relevant if the target project has the same provider-abstraction pattern; otherwise call `ViettinbankApiService.generateQr()` directly.

## To reuse in another NestJS backend

1. Copy `src/viettinbank/crypto-key.service.ts`, `viettinbank-api.service.ts`, `viettinbank.module.ts`.
2. Add a `viettinbank` section to that project's config (see `src/config/configuration.ts` here) and the `VIETINBANK_*` env vars from `.env.example`.
3. Place VietinBank's RSA keys/cert under a `certs/viettinbank/` directory (never commit them) and point the `VIETINBANK_*_PATH` env vars at them.
4. Import `ViettinbankModule` wherever `CryptoKeyService` / `ViettinbankApiService` are needed.
5. Re-implement `viettinbank.controller.ts`'s `inqBill()`/`notifyBill()` bodies against that project's own order/payment lookup — the signing/verification and response envelope logic can be copied verbatim.

## Config keys

| Env var | Purpose |
| --- | --- |
| `VIETINBANK_BASE_URL` | VietinBank generate-QR API endpoint |
| `VIETINBANK_CLIENT_ID` / `VIETINBANK_CLIENT_SECRET` | IBM API Connect credentials |
| `VIETINBANK_PROVIDER_ID` / `VIETINBANK_MERCHANT_ID` | Assigned by VietinBank onboarding |
| `VIETINBANK_ACCOUNT` | Virtual sub-account prefix; order code is appended to build the full account number |
| `VIETINBANK_PRIVATE_KEY_PATH` | Our RSA private key, used to sign responses to VietinBank |
| `VIETINBANK_PUBLIC_KEY_PATH` | Our RSA public key, used to verify VietinBank's generate-QR response signature |
| `VIETINBANK_NOTIFY_CERT_PATH` | VietinBank's certificate, used to verify inbound `inq-bill`/`notify-bill` signatures |
