// Adaptador provisional de PolicySource (E3-H2): siempre "SOF estándar". E4-H1 lo reemplaza por
// uno que lee approval_policies del tenant.
import type { PolicySource } from '../application/ports';
import { STANDARD_SOF_POLICY } from '../domain/standard-policy';

export const standardPolicySource: PolicySource = {
  activeFor: () => Promise.resolve(STANDARD_SOF_POLICY),
};
