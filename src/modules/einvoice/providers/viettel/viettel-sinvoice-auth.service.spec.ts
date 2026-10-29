import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { ViettelSinvoiceAuthService } from './viettel-sinvoice-auth.service';
import { ViettelSinvoiceTokenStore } from './viettel-sinvoice-token.store';

describe('ViettelSinvoiceAuthService', () => {
  const axiosRef = { post: jest.fn() };
  const http = { axiosRef } as unknown as HttpService;
  const config = new ConfigService({
    viettelSinvoice: {
      baseUrl:
        'https://api-vinvoice.viettel.vn/services/einvoiceapplication/api/',
      authUrl: 'https://api-vinvoice.viettel.vn/auth/login',
      username: 'user',
      password: 'secret',
      timeout: 90_000,
      authMode: 'TOKEN',
    },
  });

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  const jwt = (payload: object) =>
    `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;
  const clockAt = (ms: number) => jest.spyOn(Date, 'now').mockReturnValue(ms);

  it('login thành công và cache token không đặt expiry giả', async () => {
    axiosRef.post.mockResolvedValue({ data: { access_token: 'token-value' } });
    const service = new ViettelSinvoiceAuthService(
      http,
      config,
      new ViettelSinvoiceTokenStore(),
    );
    await expect(service.getHeaders()).resolves.toEqual({
      Cookie: 'access_token=token-value',
    });
    await service.getHeaders();
    expect(axiosRef.post).toHaveBeenCalledTimes(1);
    expect(axiosRef.post).toHaveBeenCalledWith(
      'https://api-vinvoice.viettel.vn/auth/login',
      { username: 'user', password: 'secret' },
      expect.any(Object),
    );
  });

  it('login lại trước khi token hết hạn theo expires_in', async () => {
    axiosRef.post.mockResolvedValue({
      data: { access_token: 'token-value', expires_in: 600 },
    });
    const service = new ViettelSinvoiceAuthService(
      http,
      config,
      new ViettelSinvoiceTokenStore(),
    );
    clockAt(0);
    await service.getHeaders();
    clockAt(539_000);
    await service.getHeaders();
    expect(axiosRef.post).toHaveBeenCalledTimes(1);
    clockAt(540_000);
    await service.getHeaders();
    expect(axiosRef.post).toHaveBeenCalledTimes(2);
  });

  it('không có expires_in thì lấy hạn từ exp - iat của JWT', async () => {
    axiosRef.post.mockResolvedValue({
      data: { access_token: jwt({ iat: 1_000, exp: 1_300 }) },
    });
    const service = new ViettelSinvoiceAuthService(
      http,
      config,
      new ViettelSinvoiceTokenStore(),
    );
    clockAt(0);
    await service.getHeaders();
    clockAt(239_000);
    await service.getHeaders();
    expect(axiosRef.post).toHaveBeenCalledTimes(1);
    clockAt(240_000);
    await service.getHeaders();
    expect(axiosRef.post).toHaveBeenCalledTimes(2);
  });

  it('gom các request đồng thời vào một lần login', async () => {
    axiosRef.post.mockResolvedValue({ data: { access_token: 'token-value' } });
    const service = new ViettelSinvoiceAuthService(
      http,
      config,
      new ViettelSinvoiceTokenStore(),
    );
    await Promise.all([
      service.getHeaders(),
      service.getHeaders(),
      service.getHeaders(),
    ]);
    expect(axiosRef.post).toHaveBeenCalledTimes(1);
  });

  it('map login fail thành AUTH_ERROR và không lộ credential', async () => {
    axiosRef.post.mockRejectedValue(new Error('network'));
    const service = new ViettelSinvoiceAuthService(
      http,
      config,
      new ViettelSinvoiceTokenStore(),
    );
    await expect(service.getHeaders()).rejects.toMatchObject({
      kind: 'AUTH_ERROR',
    });
    await expect(service.getHeaders()).rejects.not.toThrow('secret');
  });
});
