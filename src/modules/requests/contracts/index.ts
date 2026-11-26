// Contratos públicos de requests: entrada segura para el cliente (solo Zod, sin base de datos).
// Se importa como @/modules/requests/contracts (ADR-001 §10).
export * as createDraftContract from './create-draft';
export * as updateDraftContract from './update-draft';
export * as submitRequestContract from './submit-request';
export * as getRequestContract from './get-request';
export * as listRequestsContract from './list-requests';
export * as getDocumentSequenceContract from './get-document-sequence';
export * as updateDocumentSequenceContract from './update-document-sequence';
export * as platformGetDocumentSequenceContract from './platform-get-document-sequence';
export * as platformUpdateDocumentSequenceContract from './platform-update-document-sequence';
export {
  sequenceNextNumberSchema,
  sequencePrefixSchema,
  sequenceSetupFieldsSchema,
} from './shared';
export { REQUEST_STATUSES } from '../domain/request-state-machine';
export {
  DEFAULT_INBOX_TAB,
  INBOX_TABS,
  MORE_TABS,
  VISIBLE_TABS,
  type InboxTab,
} from '../domain/inbox';
export { MAX_LINES } from '../domain/request';
export { PREFIX_MAX, formatDocumentNumber, normalizePrefix } from '../domain/numbering';
// Dinero y cantidades: el editor del cliente calcula el total en vivo con las mismas funciones
// decimal.js (HALF_UP) que usa el servidor, nunca con number.
export {
  incrementQuantity,
  lineSubtotal,
  parseQuantity,
  sumTotal,
  type Currency,
} from '../domain/money';
export { REASON_MAX } from '../domain/request';
