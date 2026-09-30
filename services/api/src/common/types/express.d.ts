import type { AuthenticatedUser } from './authenticated-user.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Attached by AuthGuard. Present only on routes that passed it. */
      user?: AuthenticatedUser;
    }
  }
}

export {};
