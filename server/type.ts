import type { D1Database } from '@cloudflare/workers-types'

export interface Env {
  Bindings: {
    DB: D1Database;
    COOKIE_SECRET: string;
  };
  Variables: {
    userId: string;
  };
}
