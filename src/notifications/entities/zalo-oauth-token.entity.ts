import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * Persisted Zalo OA OAuth token pair. Zalo's v4 refresh flow rotates the
 * refresh_token on every use — the new one MUST be saved back or the OA
 * loses the ability to refresh again, so this can't just live in memory.
 * One row per configured OA (oaId), found by ZaloTokenService.
 */
@Entity('zalo_oauth_tokens')
export class ZaloOAuthToken extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  oaId: string;

  @Column({ type: 'text' })
  accessToken: string;

  @Column({ type: 'text' })
  refreshToken: string;

  @Column({ type: 'timestamptz' })
  accessTokenExpiresAt: Date;
}
