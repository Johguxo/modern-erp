// Contratos públicos de requests: entrada segura para el cliente (solo Zod, sin base de datos).
// Se importa como @/modules/requests/contracts (ADR-001 §10).
export * as createDraftContract from './create-draft';
export * as updateDraftContract from './update-draft';
export * as submitRequestContract from './submit-request';
export * as getRequestContract from './get-request';
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
export { MAX_LINES } from '../domain/request';
export { PREFIX_MAX, formatDocumentNumber, normalizePrefix } from '../domain/numbering';
