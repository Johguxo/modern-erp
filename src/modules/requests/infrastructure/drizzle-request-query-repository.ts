// Consulta de la bandeja (E3-H3) sobre `requests` con la transacción de withTenant: RLS y filtro
// explícito por tenantId (primera defensa). Solo toca esta tabla; los nombres de otros módulos se
// resuelven aparte. Índices de E3-H1: (tenant, updated_at desc), (tenant, status, updated_at desc)
// y (tenant, requester, updated_at desc).
import { and, count, desc, eq, inArray, isNotNull, ne, or, sql, type SQL } from 'drizzle-orm';

import { escapeLike, searchWords, type DbExecutor } from '@/db';
import { requests } from '@/db/schema';
import { offsetOf } from '@/shared/pagination';

import type {
  InboxListQuery,
  InboxRow,
  InboxVisibility,
  RequestQueryRepository,
} from '../application/ports';
import { TAB_STATUS, type InboxScope, type InboxTab } from '../domain/inbox';
import { formatAmount, type Currency } from '../domain/money';
import type { RequestStatus } from '../domain/request-state-machine';

const columns = {
  id: requests.id,
  number: requests.number,
  status: requests.status,
  requesterId: requests.requesterId,
  equipmentId: requests.equipmentId,
  costCenterId: requests.costCenterId,
  currency: requests.currency,
  totalAmount: requests.totalAmount,
  updatedAt: requests.updatedAt,
};

const NONE = sql`false`;

/** `id in (...)`, o falso si la lista está vacía. */
const idIn = (ids: readonly string[]): SQL =>
  ids.length === 0 ? NONE : inArray(requests.id, [...ids]);

/**
 * Visibilidad: lo propio y, si se envió alguna vez (tiene número), lo que lee todo el mundo o tiene
 * asignado. Un borrador anulado sigue sin número: solo lo ve su dueño.
 */
function visibleCondition(scope: InboxScope): SQL {
  const mine = eq(requests.requesterId, scope.viewerId);
  const sent = isNotNull(requests.number);
  const others = scope.readAll ? sent : and(sent, idIn(scope.assignedIds));
  return or(mine, others) as SQL;
}

/** «Esperan mi aprobación»: paso pendiente mío, en aprobación y que no la creé yo. */
function awaitingCondition(scope: InboxScope, pendingIds: readonly string[]): SQL {
  return and(
    eq(requests.status, 'in_approval'),
    ne(requests.requesterId, scope.viewerId),
    idIn(pendingIds),
  ) as SQL;
}

function tabCondition(tab: InboxTab, visibility: InboxVisibility): SQL | undefined {
  if (tab === 'all') return undefined;
  if (tab === 'awaiting_me') return awaitingCondition(visibility.scope, visibility.pendingIds);
  return eq(requests.status, TAB_STATUS[tab]);
}

/** Cada palabra debe aparecer en el número o en el motivo (comodines escapados). */
function searchConditions(q: string | null): SQL[] {
  return searchWords(q ?? '').map((word) => {
    const pattern = `%${escapeLike(word)}%`;
    // `number` es null en borradores: ilike da null y el motivo decide.
    return sql`(${requests.number} ilike ${pattern} or ${requests.reason} ilike ${pattern})`;
  });
}

export function createDrizzleRequestQueryRepository(db: DbExecutor): RequestQueryRepository {
  return {
    async list(query: InboxListQuery) {
      const where = and(
        eq(requests.tenantId, query.tenantId),
        visibleCondition(query.scope),
        tabCondition(query.tab, query),
        ...searchConditions(query.q),
      );
      const [rows, [totalRow]] = await Promise.all([
        db
          .select(columns)
          .from(requests)
          .where(where)
          .orderBy(desc(requests.updatedAt), desc(requests.id))
          .limit(query.pageSize)
          .offset(offsetOf(query)),
        db.select({ total: count() }).from(requests).where(where),
      ]);
      const items: InboxRow[] = rows.map((row) => ({
        id: row.id,
        docType: 'SOF',
        number: row.number,
        // Los check constraints de la base garantizan estos valores.
        status: row.status as RequestStatus,
        requesterId: row.requesterId,
        equipmentId: row.equipmentId,
        costCenterId: row.costCenterId,
        currency: row.currency as Currency,
        totalAmount: formatAmount(row.totalAmount),
        updatedAt: row.updatedAt,
      }));
      return { items, total: totalRow?.total ?? 0 };
    },

    async summary(visibility, weekStart) {
      const awaiting = awaitingCondition(visibility.scope, visibility.pendingIds);
      const [row] = await db
        .select({
          awaitingMe: sql<number>`count(*) filter (where ${awaiting})`.mapWith(Number),
          inApproval:
            sql<number>`count(*) filter (where ${requests.status} = 'in_approval')`.mapWith(Number),
          approvedThisWeek:
            sql<number>`count(*) filter (where ${requests.status} = 'approved' and ${requests.approvedAt} >= ${weekStart.toISOString()}::timestamptz)`.mapWith(
              Number,
            ),
        })
        .from(requests)
        .where(and(eq(requests.tenantId, visibility.tenantId), visibleCondition(visibility.scope)));
      return {
        awaitingMe: row?.awaitingMe ?? 0,
        inApproval: row?.inApproval ?? 0,
        approvedThisWeek: row?.approvedThisWeek ?? 0,
      };
    },
  };
}
