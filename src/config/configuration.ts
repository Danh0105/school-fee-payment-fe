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
    orderExpiresMinutes: parseInt(process.env.PAYMENT_ORDER_EXPIRES_MINUTES ?? '60', 10),
  },

  cors: {
    origins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((o) => o.trim()),
  },
});
