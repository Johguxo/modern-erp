// Datos del cliente HTTP para la auditoría (E1-H3, ADR-005): viajan fuera de Ctx. La IP sale de
// x-forwarded-for y es solo informativa (la puede falsear quien llame).
export interface ClientInfo {
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export const UNKNOWN_CLIENT: ClientInfo = { ip: null, userAgent: null };
