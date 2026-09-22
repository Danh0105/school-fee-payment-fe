import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_KEY = 'rawResponse';

/**
 * Marks a route's response as already in its final wire format, so
 * TransformInterceptor must not wrap it in the app's own `{ success, data }`
 * envelope. Needed for endpoints that speak an external partner's own
 * response envelope verbatim — e.g. VietinBank's eBank Biz callbacks, which
 * require the bare `{ header, data }` shape from their spec, not our
 * internal REST convention.
 */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
