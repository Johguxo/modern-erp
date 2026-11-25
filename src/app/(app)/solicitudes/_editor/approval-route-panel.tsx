// "Ruta de aprobación": el solicitante y los pasos de la política vigente (vista previa de solo
// lectura). Los botones de acción los pone el editor como hijos.
import type { ReactNode } from 'react';

import type { RoutePreview } from '@/modules/approvals';
import { messages } from '@/ui/messages/es-PE';

const t = messages.requests.route;

function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-status-in-approval-bg text-[13px] font-semibold text-status-in-approval-fg"
    >
      {n}
    </span>
  );
}

export function ApprovalRoutePanel({
  route,
  requesterEmail,
  children,
}: {
  route: RoutePreview;
  requesterEmail: string;
  /** Avisos y botones de acción. */
  children: ReactNode;
}) {
  return (
    <aside
      aria-label={t.title}
      className="flex min-w-0 flex-[1_1_280px] flex-col gap-4 rounded-xl border border-border bg-surface p-5"
    >
      <h2 className="text-base font-semibold">{t.title}</h2>
      <p className="text-[13px] text-muted-foreground">{t.description}</p>
      <ol className="flex flex-col gap-3">
        <li className="flex items-center gap-3">
          <StepNumber n={1} />
          <span className="min-w-0 break-words">{t.requester(requesterEmail)}</span>
        </li>
        {route.steps.map((step, index) => {
          const role = messages.roles[step.role];
          return (
            <li key={step.order} className="flex items-center gap-3">
              <StepNumber n={index + 2} />
              <span className="min-w-0">
                <span className="block">{step.name}</span>
                <span className="block text-[13px] text-muted-foreground">
                  {step.rule === 'all' ? t.ruleAll(role) : t.ruleAny(role)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="rounded-lg bg-primary-soft p-3 text-[13px] text-primary-hover">{t.notice}</p>
      {children}
    </aside>
  );
}
