// Funcionalidades que un plan puede habilitar (ADR-002 §3). En el MVP solo se usa `sof`; el resto
// queda reservado para las fases siguientes.
export const PLAN_FEATURES = [
  'sof',
  'pr_pd',
  'quotes_ai',
  'whatsapp',
  'dashboard',
  'microsoft_login',
  'external_approvals',
] as const;

export type PlanFeature = (typeof PLAN_FEATURES)[number];
