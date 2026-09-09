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
