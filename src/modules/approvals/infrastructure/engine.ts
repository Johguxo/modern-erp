// Motor de aprobaciones sobre la transacción de withTenant (E4-H2). Implementa por estructura los
// puertos que requests define (ApprovalStarter, ApprovalCanceller, ApprovalDecider y
// ApprovalAssignments): approvals no importa requests, y solo src/app/_lib/requests.ts une los dos
// módulos (ADR-008).
import type { DbExecutor } from '@/db';
import type { Ctx } from '@/shared/context';
import type { Clock } from '@/shared/ports/clock';
import type { Logger } from '@/shared/ports/logger';

import { cancelApproval, type CancelApprovalInput } from '../application/cancel-approval';
import {
  createApprovalTimeline,
  type ApprovalTimelineView,
} from '../application/approval-timeline';
import {
  createApprovalAssignments,
  createApprovalHistory,
  type ApprovalAssignmentsView,
  type ApprovalHistoryView,
} from '../application/approval-queries';
import {
  decideApproval,
  type DecideApprovalInput,
  type DecideApprovalOutput,
} from '../application/decide-approval-step';
import type { ApprovalEngineDeps } from '../application/ports';
import { startApproval, type StartApprovalInput } from '../application/start-approval';

import { createApproverDirectory } from './approver-directory';
import { createDrizzleApprovalQueries } from './drizzle-approval-queries';
import { createDrizzleEventLog } from './drizzle-event-log';
import { createDrizzleInstanceRepository } from './drizzle-instance-repository';
import { createDrizzlePolicyRepository } from './drizzle-policy-repository';

export interface ApprovalEngine {
  readonly starter: {
    start(ctx: Ctx, input: StartApprovalInput): Promise<{ readonly round: number }>;
  };
  readonly canceller: { cancel(ctx: Ctx, input: CancelApprovalInput): Promise<void> };
  readonly decider: {
    decide(ctx: Ctx, input: DecideApprovalInput): Promise<DecideApprovalOutput>;
  };
  readonly assignments: ApprovalAssignmentsView;
  readonly history: ApprovalHistoryView;
  readonly timeline: ApprovalTimelineView;
}

export interface ApprovalEngineExtras {
  readonly clock: Clock;
  readonly logger: Logger;
}

export function createApprovalEngine(db: DbExecutor, extras: ApprovalEngineExtras): ApprovalEngine {
  const deps: ApprovalEngineDeps = {
    policies: createDrizzlePolicyRepository(db),
    directory: createApproverDirectory(db),
    instances: createDrizzleInstanceRepository(db),
    events: createDrizzleEventLog(db),
    clock: extras.clock,
    logger: extras.logger,
  };
  const queries = createDrizzleApprovalQueries(db);
  return {
    starter: { start: (ctx, input) => startApproval(ctx, input, deps) },
    canceller: { cancel: (ctx, input) => cancelApproval(ctx, input, deps) },
    decider: { decide: (ctx, input) => decideApproval(ctx, input, deps) },
    assignments: createApprovalAssignments(queries),
    history: createApprovalHistory(queries),
    timeline: createApprovalTimeline(queries),
  };
}
