// Resolver de ctx falso: devuelve el ctx dado (o null = sin sesión) y guarda las llamadas.
import type { CtxRequest, CtxResolver } from '@/app/_lib/ctx-resolver';
import type { Ctx } from '@/shared/context';

export interface FakeCtxResolver {
  readonly resolve: CtxResolver;
  readonly calls: CtxRequest[];
}

export function fakeCtxResolver(ctx: Ctx | null): FakeCtxResolver {
  const calls: CtxRequest[] = [];
  return {
    calls,
    resolve: (request) => {
      calls.push(request);
      return Promise.resolve(ctx ? { ...ctx, requestId: request.requestId } : null);
    },
  };
}
