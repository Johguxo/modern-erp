// Cómo se arma el Ctx de cada request. La implementación real (cookies, Supabase Auth y
// membresía activa) llega en E1-H2; hasta entonces no hay sesión.
import type { Ctx } from '@/shared/context';

export interface CtxRequest {
  readonly headers: Headers;
  readonly requestId: string;
}

/** Devuelve el ctx del usuario con sesión y empresa activa, o null si no hay sesión. */
export type CtxResolver = (request: CtxRequest) => Promise<Ctx | null>;

export const unconfiguredCtxResolver: CtxResolver = () => Promise.resolve(null);
