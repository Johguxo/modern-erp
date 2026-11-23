// Contrato de un caso de uso: esquemas Zod de entrada y salida (CLAUDE.md, convenciones).
import type { z } from 'zod';

export interface Contract<I extends z.ZodType = z.ZodType, O extends z.ZodType = z.ZodType> {
  readonly inputSchema: I;
  readonly outputSchema: O;
}

export type ContractInput<C extends Contract> = z.output<C['inputSchema']>;
export type ContractOutput<C extends Contract> = z.output<C['outputSchema']>;
