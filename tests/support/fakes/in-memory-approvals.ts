// Repositorio de instancias y registro de eventos en memoria para las pruebas del motor de
// aprobaciones (E4-H2). Imita las actualizaciones condicionales de la implementación Drizzle.
import type {
  ApprovalEventLog,
  ApprovalInstanceRepository,
  NewApprovalEvent,
  StepWithRequest,
} from '@/modules/approvals/application/ports';
import type {
  AssigneeRecord,
  InstanceRecord,
  InstanceStatus,
  PolicySnapshot,
} from '@/modules/approvals/domain/approval-instance';

interface StoredInstance {
  id: string;
  requestId: string;
  round: number;
  status: InstanceStatus;
  policyId: string;
  snapshot: PolicySnapshot;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type StoredAssignee = Mutable<AssigneeRecord>;
type StoredStep = Mutable<Omit<StepWithRequest, 'assignees'>> & {
  assignees: StoredAssignee[];
  kind: 'normal' | 'reconfirmation';
  lineIds: readonly string[] | null;
};

export class InMemoryApprovals implements ApprovalInstanceRepository, ApprovalEventLog {
  readonly instances: StoredInstance[] = [];
  readonly steps: StoredStep[] = [];
  readonly events: NewApprovalEvent[] = [];
  /** `approval_policies.settings` que devuelve `settingsOf`. */
  settings: unknown = {};
  private seq = 0;

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  lockLatest(_tenantId: string, requestId: string): Promise<InstanceRecord | null> {
    const found = this.instances
      .filter((i) => i.requestId === requestId)
      .sort((a, b) => b.round - a.round)[0];
    return Promise.resolve(found ? this.toRecord(found) : null);
  }

  create(
    _tenantId: string,
    input: {
      requestId: string;
      round: number;
      policyId: string;
      snapshot: PolicySnapshot;
    },
  ): Promise<InstanceRecord> {
    const stored: StoredInstance = {
      id: this.nextId('inst'),
      status: 'in_progress',
      ...input,
    };
    this.instances.push(stored);
    return Promise.resolve(this.toRecord(stored));
  }

  insertSteps(
    _tenantId: string,
    instance: InstanceRecord,
    steps: Parameters<ApprovalInstanceRepository['insertSteps']>[2],
  ): Promise<StepWithRequest[]> {
    const created = steps.map((step) => {
      const stored: StoredStep = {
        id: this.nextId('step'),
        instanceId: instance.id,
        requestId: instance.requestId,
        order: step.order,
        name: step.name,
        rule: step.rule,
        status: step.status,
        kind: step.kind ?? 'normal',
        lineIds: step.lineIds ?? null,
        assignees: step.assigneeIds.map((userId) => ({
          id: this.nextId('asg'),
          userId,
          decision: null,
        })),
      };
      this.steps.push(stored);
      return stored;
    });
    return Promise.resolve(created.map((s) => this.clone(s)));
  }

  findStep(_tenantId: string, stepId: string): Promise<StepWithRequest | null> {
    const found = this.steps.find((s) => s.id === stepId);
    return Promise.resolve(found ? this.clone(found) : null);
  }

  stepsOf(_tenantId: string, instanceId: string): Promise<StepWithRequest[]> {
    return Promise.resolve(
      this.steps
        .filter((s) => s.instanceId === instanceId)
        .sort((a, b) => a.order - b.order)
        .map((s) => this.clone(s)),
    );
  }

  recordAssigneeDecision(
    _tenantId: string,
    input: Parameters<ApprovalInstanceRepository['recordAssigneeDecision']>[1],
  ): Promise<boolean> {
    const step = this.steps.find((s) => s.id === input.stepId);
    const assignee = step?.assignees.find((a) => a.userId === input.userId);
    if (!assignee || assignee.decision !== null) return Promise.resolve(false);
    assignee.decision = input.decision;
    return Promise.resolve(true);
  }

  closeStep(
    _tenantId: string,
    stepId: string,
    patch: Parameters<ApprovalInstanceRepository['closeStep']>[2],
  ): Promise<boolean> {
    const step = this.steps.find((s) => s.id === stepId);
    if (!step || step.status !== 'pending') return Promise.resolve(false);
    step.status = patch.status;
    return Promise.resolve(true);
  }

  activateStep(_tenantId: string, stepId: string): Promise<boolean> {
    const step = this.steps.find((s) => s.id === stepId);
    if (!step || step.status !== 'waiting') return Promise.resolve(false);
    step.status = 'pending';
    return Promise.resolve(true);
  }

  cancelOpenSteps(_tenantId: string, instanceId: string): Promise<number> {
    const open = this.steps.filter(
      (s) => s.instanceId === instanceId && (s.status === 'waiting' || s.status === 'pending'),
    );
    for (const step of open) step.status = 'cancelled';
    return Promise.resolve(open.length);
  }

  reopenInstance(_tenantId: string, instanceId: string): Promise<boolean> {
    const instance = this.instances.find((i) => i.id === instanceId);
    if (!instance || instance.status !== 'approved') return Promise.resolve(false);
    instance.status = 'in_progress';
    return Promise.resolve(true);
  }

  settingsOf(): Promise<unknown> {
    return Promise.resolve(this.settings);
  }

  closeInstance(
    _tenantId: string,
    instanceId: string,
    status: Exclude<InstanceStatus, 'in_progress'>,
  ): Promise<boolean> {
    const instance = this.instances.find((i) => i.id === instanceId);
    if (!instance || instance.status !== 'in_progress') return Promise.resolve(false);
    instance.status = status;
    return Promise.resolve(true);
  }

  append(_tenantId: string, event: NewApprovalEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  private toRecord(instance: StoredInstance): InstanceRecord {
    return {
      id: instance.id,
      requestId: instance.requestId,
      round: instance.round,
      status: instance.status,
    };
  }

  private clone(step: StoredStep): StepWithRequest {
    return { ...step, assignees: step.assignees.map((a) => ({ ...a })) };
  }
}
