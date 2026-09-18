export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3010', 10),

  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_DATABASE ?? 'school_fee',
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'change-me-refresh',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  },

  // Separate signing secret for parent-portal tokens (parent enters a
  // student's identifierCode to reach that student's payment page), kept
  // independent from the staff `jwt.secret` so a parent token can never be
  // reused against staff-only endpoints even if a guard were misconfigured.
  parentJwt: {
    secret: process.env.PARENT_JWT_SECRET ?? 'change-me-parent',
    expiresIn: process.env.PARENT_JWT_EXPIRES_IN ?? '30d',
  },

  payment: {
    defaultProvider: process.env.PAYMENT_PROVIDER ?? 'VIETQR',
    bankCode: process.env.BANK_CODE ?? '',
    bankAccountNumber: process.env.BANK_ACCOUNT_NUMBER ?? '',
    bankAccountName: process.env.BANK_ACCOUNT_NAME ?? '',
    orderExpiresMinutes: parseInt(
      process.env.PAYMENT_ORDER_EXPIRES_MINUTES ?? '60',
      10,
    ),
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? '',
  },

  viettinbank: {
    baseUrl: process.env.VIETINBANK_BASE_URL ?? '',
    clientId: process.env.VIETINBANK_CLIENT_ID ?? '',
    clientSecret: process.env.VIETINBANK_CLIENT_SECRET ?? '',
    providerId: process.env.VIETINBANK_PROVIDER_ID ?? '9752',
    merchantId: process.env.VIETINBANK_MERCHANT_ID ?? '9752',
    account: process.env.VIETINBANK_ACCOUNT ?? '',
    privateKeyPath: process.env.VIETINBANK_PRIVATE_KEY_PATH ?? '',
    publicKeyPath: process.env.VIETINBANK_PUBLIC_KEY_PATH ?? '',
    notifyCertPath: process.env.VIETINBANK_NOTIFY_CERT_PATH ?? '',
  },

  cors: {
    origins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim()),
  },

  zalo: {
    oaId: process.env.ZALO_OA_ID ?? '',
    appId: process.env.ZALO_APP_ID ?? '',
    appSecret: process.env.ZALO_APP_SECRET ?? '',
    znsTemplateId: process.env.ZALO_ZNS_TEMPLATE_ID ?? '',
    // One-time bootstrap value from the OA's initial OAuth authorization —
    // only read when no token row exists yet in the database. After the
    // first successful refresh, the DB row is authoritative and this is
    // never read again.
    initialRefreshToken: process.env.ZALO_INITIAL_REFRESH_TOKEN ?? '',
  },
});
