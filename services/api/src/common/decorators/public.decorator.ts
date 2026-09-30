import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without a bearer access token.
 *
 * The AuthGuard denies by default, so every route that is not explicitly
 * public requires authentication. Only infrastructure endpoints (health,
 * liveness) and the credential-exchange endpoints (login, refresh, logout)
 * may use this. Adding it to a business endpoint makes that endpoint
 * unauthenticated, so it must never be applied by default.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
