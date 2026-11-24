// Destino tras el login (E1-H2): lee el acceso del usuario y aplica decideEntry.
import { decideEntry, type EntryAccess, type EntryDecision } from '../domain/entry';

import type { SessionRepository } from './session-ports';

export async function resolveEntry(
  authUserId: string,
  deps: { sessions: SessionRepository },
): Promise<{ decision: EntryDecision; access: EntryAccess }> {
  const access = await deps.sessions.findEntryAccess(authUserId);
  return { decision: decideEntry(access), access };
}
